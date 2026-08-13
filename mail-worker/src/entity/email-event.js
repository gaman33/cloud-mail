import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const emailEvent = sqliteTable('email_event', {
	eventId: integer('event_id').primaryKey({ autoIncrement: true }),
	emailId: integer('email_id').notNull(),
	trackingId: integer('tracking_id'),
	userId: integer('user_id').notNull(),
	recipientEmail: text('recipient_email').default('').notNull(),
	providerEventId: text('provider_event_id'),
	eventType: text('event_type').notNull(),
	eventTime: text('event_time').notNull(),
	ip: text('ip').default('').notNull(),
	country: text('country').default('').notNull(),
	region: text('region').default('').notNull(),
	city: text('city').default('').notNull(),
	userAgent: text('user_agent').default('').notNull(),
	browser: text('browser').default('').notNull(),
	os: text('os').default('').notNull(),
	device: text('device').default('').notNull(),
	url: text('url').default('').notNull(),
	source: text('source').default('').notNull(),
	metadata: text('metadata').default('{}').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, table => [
	uniqueIndex('idx_email_event_provider_event_id').on(table.providerEventId),
	index('idx_email_event_email_id_time').on(table.emailId, table.eventTime)
]);

export default emailEvent;
