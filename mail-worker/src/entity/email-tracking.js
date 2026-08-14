import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const emailTracking = sqliteTable('email_tracking', {
	trackingId: integer('tracking_id').primaryKey({ autoIncrement: true }),
	emailId: integer('email_id').notNull(),
	userId: integer('user_id').notNull(),
	recipientEmail: text('recipient_email').default('').notNull(),
	token: text('token').notNull(),
	providerEmailId: text('provider_email_id'),
	provider: text('provider').default('resend').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, table => [
	uniqueIndex('idx_email_tracking_token').on(table.token)
]);

export default emailTracking;
