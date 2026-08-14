function canonicalMessage(body) {
	const fields = body.Type === 'Notification'
		? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
		: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
	return fields.filter(field => body[field] !== undefined).map(field => `${field}\n${body[field]}\n`).join('');
}

function decodeBase64(value) {
	const binary = atob(String(value || '').replace(/\s+/g, ''));
	return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function pemToDer(pem) {
	const base64 = String(pem || '').replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, '');
	if (!base64) throw new Error('Missing signing certificate');
	return decodeBase64(base64);
}

function readDerElement(bytes, offset) {
	const start = offset;
	const tag = bytes[offset++];
	let length = bytes[offset++];
	if (length & 0x80) {
		const count = length & 0x7f;
		if (!count || count > 4) throw new Error('Unsupported DER length');
		length = 0;
		for (let index = 0; index < count; index++) length = (length << 8) | bytes[offset++];
	}
	const contentStart = offset;
	const end = contentStart + length;
	if (end > bytes.length) throw new Error('Invalid DER certificate');
	return {tag, start, contentStart, end};
}

function certificateSpki(pem) {
	const bytes = pemToDer(pem);
	const certificate = readDerElement(bytes, 0);
	const tbs = readDerElement(bytes, certificate.contentStart);
	let offset = tbs.contentStart;
	let element = readDerElement(bytes, offset);
	if (element.tag === 0xa0) offset = element.end;
	for (let index = 0; index < 5; index++) offset = readDerElement(bytes, offset).end;
	const spki = readDerElement(bytes, offset);
	if (spki.tag !== 0x30) throw new Error('Invalid certificate public key');
	return bytes.slice(spki.start, spki.end);
}

export function validSnsUrl(value, region = '') {
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:') return false;
		const host = url.hostname.toLowerCase();
		if (!/^sns\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/.test(host)) return false;
		return !region || host === `sns.${region}.amazonaws.com` || host === `sns.${region}.amazonaws.com.cn`;
	} catch {
		return false;
	}
}

export async function verifySnsEnvelope(body, env, fetcher = fetch) {
	const topicArn = String(env.AWS_SES_SNS_TOPIC_ARN || '');
	if (!topicArn) throw new Error('AWS_SES_SNS_TOPIC_ARN is not configured');
	if (body.TopicArn !== topicArn) throw new Error('Unexpected SNS topic');
	if (!['1', '2'].includes(String(body.SignatureVersion))) throw new Error('Unsupported SNS signature version');
	if (!validSnsUrl(body.SigningCertURL, env.AWS_SES_REGION)) throw new Error('Invalid SNS signing certificate URL');

	const response = await fetcher(body.SigningCertURL, {redirect: 'error'});
	if (!response.ok) throw new Error('Unable to load SNS signing certificate');
	const certificate = await response.text();
	const algorithm = String(body.SignatureVersion) === '1' ? 'SHA-1' : 'SHA-256';
	const key = await crypto.subtle.importKey(
		'spki',
		certificateSpki(certificate),
		{name: 'RSASSA-PKCS1-v1_5', hash: algorithm},
		false,
		['verify']
	);
	return crypto.subtle.verify(
		{name: 'RSASSA-PKCS1-v1_5'},
		key,
		decodeBase64(body.Signature),
		new TextEncoder().encode(canonicalMessage(body))
	);
}

export function validSnsSubscribeUrl(value, env) {
	return validSnsUrl(value, env.AWS_SES_REGION) && new URL(value).searchParams.has('Token');
}

export { canonicalMessage };
