import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const sendJob = sqliteTable('send_job', {
	jobId: integer('job_id').primaryKey({autoIncrement: true}),
	userId: integer('user_id').notNull(),
	accountId: integer('account_id').notNull(),
	recipientEmail: text('recipient_email').notNull(),
	idempotencyKey: text('idempotency_key').notNull(),
	payload: text('payload').notNull(),
	status: text('status').default('pending').notNull(),
	attempts: integer('attempts').default(0).notNull(),
	maxAttempts: integer('max_attempts').default(5).notNull(),
	nextAttemptTime: text('next_attempt_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastError: text('last_error').default('').notNull(),
	emailId: integer('email_id'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, table => [
	uniqueIndex('idx_send_job_user_idempotency').on(table.userId, table.idempotencyKey),
	index('idx_send_job_status_next').on(table.status, table.nextAttemptTime)
]);

export default sendJob;
