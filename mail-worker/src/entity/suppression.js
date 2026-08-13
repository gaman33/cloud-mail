import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const suppression = sqliteTable('suppression', {
	suppressionId: integer('suppression_id').primaryKey({autoIncrement: true}),
	userId: integer('user_id').notNull(),
	email: text('email').notNull(),
	reason: text('reason').default('manual').notNull(),
	source: text('source').default('cloud_mail').notNull(),
	active: integer('active').default(1).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, table => [
	uniqueIndex('idx_suppression_user_email').on(table.userId, table.email),
	index('idx_suppression_user_active').on(table.userId, table.active)
]);

export default suppression;
