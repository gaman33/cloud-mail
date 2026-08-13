import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import attService from '../service/att-service';

app.post('/attachment/upload', async c => {
	const form = await c.req.formData();
	const data = await attService.upload(c, form.get('file'), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.delete('/attachment/upload/:token', async c => {
	await attService.cancelUpload(c, c.req.param('token'), userContext.getUserId(c));
	return c.json(result.ok());
});
