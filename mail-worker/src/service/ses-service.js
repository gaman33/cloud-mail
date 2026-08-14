import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import BizError from '../error/biz-error';

const encoder = new TextEncoder();

function cleanHeader(value) {
	return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeader(value) {
	const text = cleanHeader(value);
	if (!text || /^[\x20-\x7e]*$/.test(text)) return text;
	const bytes = encoder.encode(text);
	let binary = '';
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	}
	return `=?UTF-8?B?${btoa(binary)}?=`;
}

function wrapBase64(value) {
	return String(value || '').replace(/\s+/g, '').match(/.{1,76}/g)?.join('\r\n') || '';
}

function encodeQuotedPrintable(value) {
	const bytes = encoder.encode(String(value || ''));
	let line = '';
	const lines = [];
	for (const byte of bytes) {
		let part;
		if (byte === 13) continue;
		if (byte === 10) {
			lines.push(line);
			line = '';
			continue;
		}
		if ((byte >= 33 && byte <= 60) || (byte >= 62 && byte <= 126) || byte === 9 || byte === 32) {
			part = String.fromCharCode(byte);
		} else {
			part = `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;
		}
		if (line.length + part.length > 72) {
			lines.push(`${line}=`);
			line = '';
		}
		line += part;
	}
	lines.push(line);
	return lines.join('\r\n');
}

function formatAddress(name, address) {
	return name ? `${encodeHeader(name)} <${cleanHeader(address)}>` : cleanHeader(address);
}

function marketingFromAddress(accountEmail, localPart = 'marketing') {
	const [, domain = ''] = String(accountEmail || '').toLowerCase().match(/^[^@]+@(.+)$/) || [];
	if (!domain) throw new BizError('Invalid sender account for SES marketing');
	const safeLocalPart = String(localPart || 'marketing').toLowerCase().replace(/[^a-z0-9._+-]/g, '') || 'marketing';
	return `${safeLocalPart}@news.${domain}`;
}

async function buildRawMessage(params, attachments) {
	const mixedBoundary = `cm-mixed-${crypto.randomUUID()}`;
	const alternativeBoundary = `cm-alt-${crypto.randomUUID()}`;
	const headers = [
		`From: ${formatAddress(params.name, params.fromEmail)}`,
		`To: ${params.receiveEmail.map(cleanHeader).join(', ')}`,
		...(params.ccEmail?.length ? [`Cc: ${params.ccEmail.map(cleanHeader).join(', ')}`] : []),
		...(params.replyTo ? [`Reply-To: ${cleanHeader(params.replyTo)}`] : []),
		`Subject: ${encodeHeader(params.subject)}`,
		`Message-ID: ${cleanHeader(params.rfcMessageId)}`,
		'MIME-Version: 1.0',
		`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`
	];
	if (params.sendType === 'reply' && params.messageId) {
		headers.push(`In-Reply-To: ${cleanHeader(params.messageId)}`, `References: ${cleanHeader(params.messageId)}`);
	}
	if (params.readReceiptRequested) headers.push(`Disposition-Notification-To: ${cleanHeader(params.replyTo || params.fromEmail)}`);
	for (const [key, value] of Object.entries(params.priorityHeaders || {})) headers.push(`${key}: ${cleanHeader(value)}`);
	if (params.unsubscribeUrl) {
		headers.push(`List-Unsubscribe: <${cleanHeader(params.unsubscribeUrl)}>`);
		headers.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
	}

	const parts = [
		headers.join('\r\n'),
		'',
		`--${mixedBoundary}`,
		`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
		'',
		`--${alternativeBoundary}`,
		'Content-Type: text/plain; charset=UTF-8',
		'Content-Transfer-Encoding: quoted-printable',
		'',
		encodeQuotedPrintable(params.text || ''),
		`--${alternativeBoundary}`,
		'Content-Type: text/html; charset=UTF-8',
		'Content-Transfer-Encoding: quoted-printable',
		'',
		encodeQuotedPrintable(params.html || ''),
		`--${alternativeBoundary}--`
	];

	for (const attachment of attachments) {
		const filename = cleanHeader(attachment.filename || 'attachment').replace(/"/g, "'");
		const contentType = cleanHeader(attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream');
		const contentId = cleanHeader(attachment.contentId || '').replace(/^<|>$/g, '');
		parts.push(
			`--${mixedBoundary}`,
			`Content-Type: ${contentType}; name="${filename}"`,
			'Content-Transfer-Encoding: base64',
			`Content-Disposition: ${contentId ? 'inline' : 'attachment'}; filename="${filename}"`,
			...(contentId ? [`Content-ID: <${contentId}>`] : []),
			'',
			wrapBase64(attachment.content)
		);
	}
	parts.push(`--${mixedBoundary}--`, '');
	return encoder.encode(parts.join('\r\n'));
}

const sesService = {
	configured(env) {
		return env.SES_MARKETING_ENABLED === 'true'
			&& !!env.AWS_SES_ACCESS_KEY_ID
			&& !!env.AWS_SES_SECRET_ACCESS_KEY
			&& !!env.AWS_SES_REGION
			&& !!env.AWS_SES_CONFIGURATION_SET;
	},

	async send(c, params, attachmentConverter) {
		if (c.env.SES_MARKETING_ENABLED !== 'true') throw new BizError('Amazon SES marketing is not enabled', 503);
		if (!this.configured(c.env)) throw new BizError('Amazon SES marketing configuration is incomplete', 503);

		const fromEmail = marketingFromAddress(params.accountEmail, c.env.AWS_SES_FROM_LOCAL_PART || 'marketing');
		const rfcMessageId = `<${crypto.randomUUID()}@${fromEmail.split('@')[1]}>`;
		const attachments = await attachmentConverter(params.attachments || []);
		const raw = await buildRawMessage({
			...params,
			fromEmail,
			rfcMessageId,
			replyTo: params.accountEmail
		}, attachments);
		const client = new SESv2Client({
			region: c.env.AWS_SES_REGION,
			credentials: {
				accessKeyId: c.env.AWS_SES_ACCESS_KEY_ID,
				secretAccessKey: c.env.AWS_SES_SECRET_ACCESS_KEY
			}
		});
		try {
			const response = await client.send(new SendEmailCommand({
				FromEmailAddress: fromEmail,
				Destination: {
					ToAddresses: params.receiveEmail,
					CcAddresses: params.ccEmail || []
				},
				Content: {Raw: {Data: raw}},
				ConfigurationSetName: c.env.AWS_SES_CONFIGURATION_SET,
				EmailTags: [
					{Name: 'cloud_mail_user', Value: String(params.userId || 'unknown')},
					{Name: 'cloud_mail_channel', Value: 'marketing'}
				]
			}));
			return {data: {id: response.MessageId, messageId: rfcMessageId, fromEmail}, error: null};
		} catch (error) {
			console.error('Amazon SES send failed', {name: error?.name, message: error?.message});
			return {data: null, error: {message: `Amazon SES: ${error?.message || 'send failed'}`}};
		}
	}
};

export { buildRawMessage, marketingFromAddress };
export default sesService;
