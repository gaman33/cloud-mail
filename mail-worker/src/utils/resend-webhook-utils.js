const WEBHOOK_SECRET_KEYS = [
	'resend_webhook_secret_polyurea',
	'resend_webhook_secret_coating',
	'resend_webhook_secret'
];

export function configuredWebhookSecrets(env = {}) {
	return [...new Set(WEBHOOK_SECRET_KEYS
		.map(key => String(env[key] || '').trim())
		.filter(Boolean))];
}

export function verifyWebhookWithSecrets(resend, payload, headers, webhookSecrets) {
	for (const webhookSecret of webhookSecrets) {
		try {
			return resend.webhooks.verify({
				payload,
				headers,
				webhookSecret
			});
		} catch {}
	}

	throw new Error('Webhook signature did not match any configured secret');
}
