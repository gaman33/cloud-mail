import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import orm from '../entity/orm';
import sendJob from '../entity/send-job';

const sendJobService = {
	async scheduleFailure(c, params, userId, error) {
		const recipientEmail = params.receiveEmail?.[0] || '';
		const idempotencyKey = String(params.idempotencyKey || crypto.randomUUID());
		await orm(c).insert(sendJob).values({userId, accountId: Number(params.accountId), recipientEmail, idempotencyKey,
			payload: JSON.stringify({...params, receiveEmail: [recipientEmail]}), status: 'retry', attempts: 1,
			nextAttemptTime: new Date(Date.now() + 60_000).toISOString(), lastError: String(error?.message || error || '').slice(0, 2000)})
			.onConflictDoNothing().run();
	},
	async process(c, emailService, limit = 10) {
		await c.env.db.prepare("UPDATE send_job SET status = 'retry', next_attempt_time = CURRENT_TIMESTAMP, update_time = CURRENT_TIMESTAMP WHERE status = 'processing' AND update_time < datetime('now', '-15 minutes')").run();
		const jobs = await orm(c).select().from(sendJob).where(and(inArray(sendJob.status, ['pending', 'retry']), lte(sendJob.nextAttemptTime, new Date().toISOString()))).limit(limit).all();
		for (const job of jobs) {
			const claim = await orm(c).update(sendJob).set({status: 'processing', updateTime: sql`CURRENT_TIMESTAMP`}).where(and(eq(sendJob.jobId, job.jobId), inArray(sendJob.status, ['pending', 'retry']))).run();
			const changes = claim?.meta?.changes ?? claim?.changes;
			if (changes != null && Number(changes) === 0) continue;
			try {
				const rows = await emailService.send(c, {...JSON.parse(job.payload), _retryJob: true}, job.userId);
				await orm(c).update(sendJob).set({status: 'sent', emailId: rows[0]?.emailId, updateTime: sql`CURRENT_TIMESTAMP`}).where(eq(sendJob.jobId, job.jobId)).run();
			} catch (error) {
				const attempts = job.attempts + 1;
				await orm(c).update(sendJob).set({status: attempts >= job.maxAttempts ? 'failed' : 'retry', attempts,
					nextAttemptTime: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString(),
					lastError: String(error?.message || error).slice(0, 2000), updateTime: sql`CURRENT_TIMESTAMP`}).where(eq(sendJob.jobId, job.jobId)).run();
			}
		}
		return jobs.length;
	}
};
export default sendJobService;
