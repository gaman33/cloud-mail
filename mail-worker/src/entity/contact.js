import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const contact = sqliteTable('contact', {
	contactId: integer('contact_id').primaryKey({autoIncrement: true}),
	userId: integer('user_id').notNull(),
	email: text('email').notNull(),
	name: text('name').default('').notNull(),
	tags: text('tags').default('[]').notNull(),
	notes: text('notes').default('').notNull(),
	nextFollowUpTime: text('next_follow_up_time'),
	lastContactTime: text('last_contact_time'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, table => [uniqueIndex('idx_contact_user_email').on(table.userId, table.email)]);

export default contact;
