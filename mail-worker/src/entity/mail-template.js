import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const mailTemplate = sqliteTable('mail_template', {
	templateId: integer('template_id').primaryKey({autoIncrement: true}),
	userId: integer('user_id').notNull(),
	name: text('name').notNull(),
	type: text('type').default('template').notNull(),
	subject: text('subject').default('').notNull(),
	content: text('content').default('').notNull(),
	text: text('text').default('').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, table => [index('idx_mail_template_user_type').on(table.userId, table.type)]);

export default mailTemplate;
