import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import reliabilityService from '../service/reliability-service';
import jwtUtils from '../utils/jwt-utils';

app.get('/reliability/suppressions', async c => c.json(result.ok(await reliabilityService.listSuppressions(c, userContext.getUserId(c)))));
app.delete('/reliability/suppressions', async c => { await reliabilityService.unsuppress(c, userContext.getUserId(c), c.req.query('email')); return c.json(result.ok()); });
app.get('/reliability/audit', async c => c.json(result.ok(await reliabilityService.auditList(c, userContext.getUserId(c)))));
app.get('/contacts', async c => c.json(result.ok(await reliabilityService.contacts(c, userContext.getUserId(c)))));
app.put('/contacts/:id', async c => c.json(result.ok(await reliabilityService.updateContact(c, userContext.getUserId(c), c.req.param('id'), await c.req.json()))));
app.get('/contacts/:id/timeline', async c => c.json(result.ok(await reliabilityService.contactTimeline(c, userContext.getUserId(c), c.req.param('id')))));
app.get('/reliability/dashboard', async c => c.json(result.ok(await reliabilityService.dashboard(c, userContext.getUserId(c)))));
app.get('/reliability/send-jobs', async c => c.json(result.ok(await reliabilityService.sendJobs(c, userContext.getUserId(c)))));
app.post('/reliability/send-jobs/:id/retry', async c => c.json(result.ok(await reliabilityService.retrySendJob(c, userContext.getUserId(c), c.req.param('id')))));
app.get('/reliability/deliverability/:domain', async c => {
	const domain = c.req.param('domain').toLowerCase();
	if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return c.json(result.fail('Invalid domain', 400));
	const resolve = async (name, type) => {
		try {
			const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {headers: {accept: 'application/dns-json'}});
			return response.ok ? await response.json() : null;
		} catch { return null; }
	};
	const [txt, dmarc] = await Promise.all([resolve(domain, 'TXT'), resolve(`_dmarc.${domain}`, 'TXT')]);
	return c.json(result.ok({domain, available: true, spf: JSON.stringify(txt || '').includes('v=spf1'), dmarc: JSON.stringify(dmarc || '').includes('v=DMARC1'), dkim: 'Provider-specific selector; verify it in Resend or Cloudflare Email settings.'}));
});
app.get('/unsubscribe/:token', async c => {
	const payload = await jwtUtils.verifyToken(c, c.req.param('token'));
	if (!payload?.unsubscribe || !payload.userId || !payload.email) return c.text('Invalid or expired unsubscribe link', 400);
	await reliabilityService.suppress(c, payload.userId, payload.email, 'unsubscribe', 'recipient');
	return c.html('<!doctype html><meta charset="utf-8"><title>Unsubscribed</title><main style="font:16px system-ui;max-width:560px;margin:80px auto"><h1>Unsubscribed</h1><p>You will no longer receive these emails.</p></main>');
});

app.post('/unsubscribe/:token', async c => {
	const payload = await jwtUtils.verifyToken(c, c.req.param('token'));
	if (!payload?.unsubscribe || !payload.userId || !payload.email) return c.text('Invalid or expired unsubscribe link', 400);
	await reliabilityService.suppress(c, payload.userId, payload.email, 'unsubscribe', 'one_click');
	return c.body(null, 200);
});
