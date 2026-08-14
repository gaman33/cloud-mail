import app from '../hono/hono';
import sesEventService from '../service/ses-event-service';
import { validSnsSubscribeUrl, verifySnsEnvelope } from '../utils/ses-sns-utils';

app.post('/webhooks/ses', async c => {
	let envelope;
	try {
		envelope = JSON.parse(await c.req.text());
	} catch {
		return c.text('Invalid JSON', 400);
	}

	try {
		if (!await verifySnsEnvelope(envelope, c.env)) return c.text('Invalid SNS signature', 401);
		if (envelope.Type === 'SubscriptionConfirmation') {
			if (!validSnsSubscribeUrl(envelope.SubscribeURL, c.env)) return c.text('Invalid SNS subscription URL', 400);
			const response = await fetch(envelope.SubscribeURL, {redirect: 'error'});
			if (!response.ok) return c.text('SNS subscription confirmation failed', 502);
			return c.text('SNS subscription confirmed', 200);
		}
		if (envelope.Type !== 'Notification') return c.text('Ignored SNS message type', 200);
		await sesEventService.handle(c, envelope);
		return c.text('success', 200);
	} catch (error) {
		console.error('Invalid or failed Amazon SES SNS webhook', error);
		return c.text('Invalid SNS webhook', 400);
	}
});
