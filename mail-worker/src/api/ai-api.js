import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import aiService from '../service/ai-service';
import reliabilityService from '../service/reliability-service';

app.post('/ai/draft', async c => {
	const userId = userContext.getUserId(c);
	const payload = await c.req.json();
	const draft = await aiService.draft(c, payload, userId);
	await reliabilityService.audit(c, userId, 'ai.draft', 'compose', '', {
		model: draft.model,
		company: String(payload.company || '').slice(0, 120),
		language: String(payload.language || '').slice(0, 40)
	});
	return c.json(result.ok(draft));
});
