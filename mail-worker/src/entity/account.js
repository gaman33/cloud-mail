import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const account = sqliteTable('account', {
	accountId: integer('account_id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull(),
	name: text('name').notNull().default(''),
	status: integer('status').default(0).notNull(),
	latestEmailTime: text('latest_email_time'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`),
	userId: integer('user_id').notNull(),
	allReceive: integer('all_receive').default(0).notNull(),
	sort: integer('sort').default(0).notNull(),
	signatureHtml: text('signature_html').default('').notNull(),
	signatureText: text('signature_text').default('').notNull(),
	signatureEnabled: integer('signature_enabled').default(0).notNull(),
	signatureOnReply: integer('signature_on_reply').default(1).notNull(),
	defaultPriority: text('default_priority').default('normal').notNull(),
	defaultTracking: integer('default_tracking').default(1).notNull(),
	defaultReadReceipt: integer('default_read_receipt').default(0).notNull(),
	defaultUnsubscribe: integer('default_unsubscribe').default(0).notNull(),
	isDel: integer('is_del').default(0).notNull(),
});
export default account
