import app from '../hono/hono';
import { dbInit } from '../init/init';
import result from '../model/result';
import userContext from '../security/user-context';

app.post('/init', (c) => {
	return dbInit.init(c);
})

app.post('/admin/migrate', async c => {
	if (userContext.getUser(c).email !== c.env.admin) return c.json(result.fail('Administrator required', 403));
	return c.json(result.ok(await dbInit.migrate(c)));
});
