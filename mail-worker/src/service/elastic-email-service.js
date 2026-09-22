import BizError from '../error/biz-error';

const DEFAULT_API_BASE_URL = 'https://api.elasticemail.com/v4';

function cleanHeader(value) {
	return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function formatAddress(name, address) {
	const safeAddress = cleanHeader(address);
	const safeName = cleanHeader(name).replace(/"/g, "'");
	return safeName ? `"${safeName}" <${safeAddress}>` : safeAddress;
}

export function marketingFromAddress(accountEmail, localPart = 'marketing') {
	const [, domain = ''] = String(accountEmail || '').toLowerCase().match(/^[^@]+@(.+)$/) || [];
	if (!domain) throw new BizError('Invalid sender account for Elastic Email marketing');
	const safeLocalPart = String(localPart || 'marketing').toLowerCase().replace(/[^a-z0-9._+-]/g, '') || 'marketing';
	return `${safeLocalPart}@news.${domain}`;
}

function contentHeaders(params, fromEmail, messageId) {
	const headers = {
		'Message-ID': messageId,
		...(params.priorityHeaders || {})
	};
	if (params.sendType === 'reply' && params.messageId) {
		headers['In-Reply-To'] = cleanHeader(params.messageId);
		headers.References = cleanHeader(params.messageId);
	}
	if (params.readReceiptRequested) headers['Disposition-Notification-To'] = cleanHeader(params.replyTo || fromEmail);
	if (params.unsubscribeUrl) {
		headers['List-Unsubscribe'] = `<${cleanHeader(params.unsubscribeUrl)}>`;
		headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
	}
	return headers;
}

function normalizeAttachments(attachments = []) {
	return attachments.filter(item => item.content).map(item => ({
		BinaryContent: String(item.content),
		Name: String(item.filename || 'attachment'),
		ContentType: String(item.contentType || item.mimeType || item.type || 'application/octet-stream')
	}));
}

export function buildElasticEmailRequest(params, attachments = []) {
	const fromEmail = marketingFromAddress(params.accountEmail, params.fromLocalPart);
	const messageId = `<${crypto.randomUUID()}@${fromEmail.split('@')[1]}>`;
	const body = [];
	if (params.text) body.push({ContentType: 'PlainText', Content: String(params.text), Charset: 'utf-8'});
	if (params.html) body.push({ContentType: 'HTML', Content: String(params.html), Charset: 'utf-8'});
	if (!body.length) body.push({ContentType: 'PlainText', Content: '', Charset: 'utf-8'});

	const content = {
		Body: body,
		Attachments: normalizeAttachments(attachments),
		Headers: contentHeaders(params, fromEmail, messageId),
		Postback: String(params.idempotencyKey || ''),
		EnvelopeFrom: fromEmail,
		From: formatAddress(params.name, fromEmail),
		ReplyTo: cleanHeader(params.replyTo || params.accountEmail),
		Subject: String(params.subject || '')
	};
	const options = {
		ChannelName: 'cloud-mail',
		TrackOpens: 'false',
		TrackClicks: 'false'
	};
	if (params.ccEmail?.length) {
		return {
			path: '/emails/transactional',
			payload: {
				Recipients: {To: params.receiveEmail, CC: params.ccEmail, BCC: []},
				Content: content,
				Options: options
			},
			fromEmail,
			messageId
		};
	}
	return {
		path: '/emails',
		payload: {
			Recipients: params.receiveEmail.map(address => ({Email: address})),
			Content: content,
			Options: options
		},
		fromEmail,
		messageId
	};
}

async function responseBody(response) {
	const text = await response.text();
	if (!text) return {};
	try { return JSON.parse(text); } catch { return {message: text}; }
}

async function reserveDailyQuota(c, count) {
	const limit = Math.max(1, Number(c.env.ELASTIC_EMAIL_DAILY_RECIPIENT_LIMIT || 10000));
	const usageDate = new Date().toISOString().slice(0, 10);
	await c.env.db.prepare(`INSERT OR IGNORE INTO provider_daily_usage (provider, usage_date, recipient_count) VALUES ('elastic_email', ?, 0)`).bind(usageDate).run();
	const updated = await c.env.db.prepare(`UPDATE provider_daily_usage SET recipient_count = recipient_count + ?, update_time = CURRENT_TIMESTAMP WHERE provider = 'elastic_email' AND usage_date = ? AND recipient_count + ? <= ?`)
		.bind(count, usageDate, count, limit).run();
	if (!updated?.meta?.changes) throw new BizError(`Elastic Email daily recipient limit reached (${limit})`, 429);
	return usageDate;
}

async function releaseDailyQuota(c, usageDate, count) {
	await c.env.db.prepare(`UPDATE provider_daily_usage SET recipient_count = MAX(0, recipient_count - ?), update_time = CURRENT_TIMESTAMP WHERE provider = 'elastic_email' AND usage_date = ?`)
		.bind(count, usageDate).run();
}

const elasticEmailService = {
	configured(env) {
		return env.ELASTIC_EMAIL_ENABLED === 'true' && !!env.ELASTIC_EMAIL_API_KEY;
	},

	async send(c, params, attachmentConverter) {
		if (c.env.ELASTIC_EMAIL_ENABLED !== 'true') throw new BizError('Elastic Email marketing is not enabled', 503);
		if (!this.configured(c.env)) throw new BizError('Elastic Email configuration is incomplete', 503);
		const attachments = await attachmentConverter(params.attachments || []);
		const request = buildElasticEmailRequest({
			...params,
			fromLocalPart: c.env.ELASTIC_EMAIL_FROM_LOCAL_PART || 'marketing',
			replyTo: params.accountEmail
		}, attachments);
		const baseUrl = String(c.env.ELASTIC_EMAIL_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
		const recipientCount = (params.receiveEmail?.length || 0) + (params.ccEmail?.length || 0);
		const usageDate = await reserveDailyQuota(c, recipientCount);
		try {
			const response = await fetch(`${baseUrl}${request.path}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-ElasticEmail-ApiKey': c.env.ELASTIC_EMAIL_API_KEY
				},
				body: JSON.stringify(request.payload)
			});
			const body = await responseBody(response);
			if (!response.ok) {
				await releaseDailyQuota(c, usageDate, recipientCount);
				throw new Error(body?.Error || body?.message || `HTTP ${response.status}`);
			}
			if (!body.TransactionID) throw new Error('Elastic Email did not return a TransactionID');
			return {
				data: {
					id: body.TransactionID,
					messageId: request.messageId,
					providerMessageId: body.MessageID || '',
					fromEmail: request.fromEmail
				},
				error: null
			};
		} catch (error) {
			console.error('Elastic Email send failed', {name: error?.name, message: error?.message});
			return {data: null, error: {message: `Elastic Email: ${error?.message || 'send failed'}`}};
		}
	}
};

export default elasticEmailService;
