import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const auditLog = sqliteTable('audit_log', {
	auditId: integer('audit_id').primaryKey({autoIncrement: true}),
	userId: integer('user_id').notNull(),
	action: text('action').notNull(),
	targetType: text('target_type').default('').notNull(),
	targetId: text('target_id').default('').notNull(),
	ip: text('ip').default('').notNull(),
	metadata: text('metadata').default('{}').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, table => [index('idx_audit_log_user_time').on(table.userId, table.createTime)]);

export default auditLog;
