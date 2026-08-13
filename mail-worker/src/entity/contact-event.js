import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const contactEvent = sqliteTable('contact_event', {
	contactEventId: integer('contact_event_id').primaryKey({autoIncrement: true}),
	contactId: integer('contact_id').notNull(),
	userId: integer('user_id').notNull(),
	emailId: integer('email_id'),
	eventType: text('event_type').notNull(),
	metadata: text('metadata').default('{}').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, table => [index('idx_contact_event_contact_time').on(table.contactId, table.createTime)]);

export default contactEvent;
