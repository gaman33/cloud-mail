import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import trackingService from '../service/tracking-service';
import orm from '../entity/orm';
import emailEvent from '../entity/email-event';
import { eq } from 'drizzle-orm';

app.get('/track/open/:token', async c => {
	try {
		await trackingService.recordOpen(c, c.req.param('token').replace(/\.gif$/i, ''));
	} catch (error) {
		console.error('Failed to record email open', error);
	}
	return trackingService.pixelResponse(c);
});

app.get('/track/click/:token', async c => {
	let target;
	try {
		target = new URL(c.req.query('url'));
		if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported protocol');
	} catch {
		return c.text('Invalid tracking URL', 400);
	}
	try {
		const tracked = await trackingService.recordClick(c, c.req.param('token'), target.toString());
		if (!tracked) return c.text('Invalid tracking token', 404);
	} catch (error) {
		console.error('Failed to record email click', error);
	}
	return c.redirect(target.toString(), 302);
});

app.get('/email/tracking/:emailId', async c => {
	const data = await trackingService.details(c, c.req.param('emailId'), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/tracking/export', async c => {
	const userId = userContext.getUserId(c);
	const rows = await orm(c).select().from(emailEvent).where(eq(emailEvent.userId, userId)).all();
	const columns = [
		['event_id', 'eventId'], ['email_id', 'emailId'], ['recipient_email', 'recipientEmail'],
		['event_type', 'eventType'], ['event_time', 'eventTime'], ['ip', 'ip'],
		['country', 'country'], ['region', 'region'], ['city', 'city'],
		['browser', 'browser'], ['os', 'os'], ['device', 'device'], ['url', 'url'], ['source', 'source']
	];
	const csv = [
		columns.map(([label]) => label).join(','),
		...rows.map(row => columns.map(([, key]) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))
	].join('\r\n');
	return c.body(csv, 200, {'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="cloud-mail-tracking.csv"'});
});
