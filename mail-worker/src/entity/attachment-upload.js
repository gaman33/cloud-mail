import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const attachmentUpload = sqliteTable('attachment_upload', {
	uploadId: integer('upload_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	token: text('token').notNull(),
	key: text('key').notNull(),
	filename: text('filename').notNull(),
	mimeType: text('mime_type').default('application/octet-stream').notNull(),
	size: integer('size').notNull(),
	consumed: integer('consumed').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, table => [
	uniqueIndex('idx_attachment_upload_token').on(table.token),
	index('idx_attachment_upload_user_consumed').on(table.userId, table.consumed)
]);

export default attachmentUpload;
