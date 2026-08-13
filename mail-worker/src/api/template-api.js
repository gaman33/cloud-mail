import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import templateService from '../service/template-service';
import reliabilityService from '../service/reliability-service';

app.get('/templates', async c => c.json(result.ok(await templateService.list(c, userContext.getUserId(c), c.req.query('type')))));
app.post('/templates', async c => {
	const userId = userContext.getUserId(c);
	const row = await templateService.save(c, await c.req.json(), userId);
	await reliabilityService.audit(c, userId, 'template.saved', 'template', row.templateId, {name: row.name, type: row.type});
	return c.json(result.ok(row));
});
app.delete('/templates/:id', async c => {
	const userId = userContext.getUserId(c);
	await templateService.remove(c, c.req.param('id'), userId);
	await reliabilityService.audit(c, userId, 'template.deleted', 'template', c.req.param('id'));
	return c.json(result.ok());
});
