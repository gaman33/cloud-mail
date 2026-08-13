import { and, eq, desc, sql } from 'drizzle-orm';
import orm from '../entity/orm';
import suppression from '../entity/suppression';
import auditLog from '../entity/audit-log';
import contact from '../entity/contact';
import contactEvent from '../entity/contact-event';
import reqUtils from '../utils/req-utils';
import emailEntity from '../entity/email';
import emailEvent from '../entity/email-event';
import sendJob from '../entity/send-job';

const reliabilityService = {
	async purgeExpired(c, auditDays = 180) {
		auditDays = Math.max(30, Math.min(3650, Number(auditDays) || 180));
		await c.env.db.prepare(`DELETE FROM audit_log WHERE create_time < datetime('now', ?)`)
			.bind(`-${auditDays} days`).run();
	},
	async isSuppressed(c, userId, address) {
		return !!await orm(c).select().from(suppression).where(and(eq(suppression.userId, userId), eq(suppression.email, address.toLowerCase()), eq(suppression.active, 1))).get();
	},
	async suppress(c, userId, address, reason, source = 'cloud_mail') {
		const email = address.toLowerCase();
		await orm(c).insert(suppression).values({userId, email, reason, source, active: 1})
			.onConflictDoUpdate({target: [suppression.userId, suppression.email], set: {reason, source, active: 1, updateTime: sql`CURRENT_TIMESTAMP`}}).run();
		await this.audit(c, userId, 'recipient.suppressed', 'recipient', email, {reason, source});
	},
	async listSuppressions(c, userId) { return orm(c).select().from(suppression).where(eq(suppression.userId, userId)).orderBy(desc(suppression.createTime)).all(); },
	async unsuppress(c, userId, address) {
		const email = address.toLowerCase();
		await orm(c).update(suppression).set({active: 0, updateTime: sql`CURRENT_TIMESTAMP`}).where(and(eq(suppression.userId, userId), eq(suppression.email, email))).run();
		await this.audit(c, userId, 'recipient.unsuppressed', 'recipient', email);
	},
	async audit(c, userId, action, targetType = '', targetId = '', metadata = {}) {
		await orm(c).insert(auditLog).values({userId, action, targetType, targetId: String(targetId || ''), ip: c.req ? reqUtils.getIp(c) : '', metadata: JSON.stringify(metadata)}).run();
	},
	async auditList(c, userId) { return orm(c).select().from(auditLog).where(eq(auditLog.userId, userId)).orderBy(desc(auditLog.createTime)).limit(200).all(); },
	async recordContact(c, userId, address, emailId, eventType = 'sent') {
		const email = address.toLowerCase();
		await orm(c).insert(contact).values({userId, email, lastContactTime: sql`CURRENT_TIMESTAMP`})
			.onConflictDoUpdate({target: [contact.userId, contact.email], set: {lastContactTime: sql`CURRENT_TIMESTAMP`, updateTime: sql`CURRENT_TIMESTAMP`}}).run();
		const row = await orm(c).select().from(contact).where(and(eq(contact.userId, userId), eq(contact.email, email))).get();
		await orm(c).insert(contactEvent).values({contactId: row.contactId, userId, emailId, eventType}).run();
	},
	async contacts(c, userId) { return orm(c).select().from(contact).where(eq(contact.userId, userId)).orderBy(desc(contact.lastContactTime)).all(); },
	async updateContact(c, userId, contactId, params) {
		const tags = Array.isArray(params.tags) ? params.tags : String(params.tags || '').split(',');
		const values = {
			name: String(params.name || '').trim().slice(0, 100),
			tags: JSON.stringify([...new Set(tags.map(item => String(item).trim()).filter(Boolean))].slice(0, 30)),
			notes: String(params.notes || '').slice(0, 5000),
			nextFollowUpTime: params.nextFollowUpTime || null,
			updateTime: sql`CURRENT_TIMESTAMP`
		};
		const row = await orm(c).update(contact).set(values).where(and(eq(contact.userId, userId), eq(contact.contactId, Number(contactId)))).returning().get();
		if (row) await this.audit(c, userId, 'contact.updated', 'contact', contactId, {email: row.email});
		return row;
	},
	async contactTimeline(c, userId, contactId) { return orm(c).select().from(contactEvent).where(and(eq(contactEvent.userId, userId), eq(contactEvent.contactId, Number(contactId)))).orderBy(desc(contactEvent.createTime)).all(); }
	,async sendJobs(c, userId) { return orm(c).select().from(sendJob).where(eq(sendJob.userId, userId)).orderBy(desc(sendJob.updateTime)).limit(200).all(); }
	,async retrySendJob(c, userId, jobId) {
		const row = await orm(c).update(sendJob).set({status: 'retry', nextAttemptTime: sql`CURRENT_TIMESTAMP`, updateTime: sql`CURRENT_TIMESTAMP`}).where(and(eq(sendJob.userId, userId), eq(sendJob.jobId, Number(jobId)), eq(sendJob.status, 'failed'))).returning().get();
		if (row) await this.audit(c, userId, 'send_job.retried', 'send_job', jobId);
		return row;
	}
	,async dashboard(c, userId) {
		const statusRows = await orm(c).select({status: emailEntity.status, total: sql`count(*)`}).from(emailEntity).where(and(eq(emailEntity.userId, userId), eq(emailEntity.type, 1))).groupBy(emailEntity.status).all();
		const eventRows = await orm(c).select({eventType: emailEvent.eventType, total: sql`count(*)`}).from(emailEvent).where(eq(emailEvent.userId, userId)).groupBy(emailEvent.eventType).all();
		const suppressions = await orm(c).select({total: sql`count(*)`}).from(suppression).where(and(eq(suppression.userId, userId), eq(suppression.active, 1))).get();
		return {statuses: statusRows, events: eventRows, suppressed: Number(suppressions?.total || 0)};
	}
};
export default reliabilityService;
