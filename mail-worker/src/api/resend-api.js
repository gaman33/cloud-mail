import { Resend } from 'resend';
import resendService from '../service/resend-service';
import app from '../hono/hono';

app.post('/webhooks', async c => {
	const webhookSecret = c.env.resend_webhook_secret;
	if (!webhookSecret) return c.text('Webhook secret is not configured', 503);

	const payload = await c.req.text();
	const providerEventId = c.req.header('svix-id');
	const timestamp = c.req.header('svix-timestamp');
	const signature = c.req.header('svix-signature');
	if (!providerEventId || !timestamp || !signature) return c.text('Missing webhook signature', 400);

	try {
		const resend = new Resend('re_webhook_verification_only');
		const body = resend.webhooks.verify({
			payload,
			headers: { id: providerEventId, timestamp, signature },
			webhookSecret
		});
		await resendService.webhooks(c, body, providerEventId);
		return c.text('success', 200);
	} catch (error) {
		console.error('Invalid or failed Resend webhook', error);
		return c.text('Invalid webhook', 400);
	}
});
