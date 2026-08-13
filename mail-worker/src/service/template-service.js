import { and, desc, eq, sql } from 'drizzle-orm';
import orm from '../entity/orm';
import mailTemplate from '../entity/mail-template';
import BizError from '../error/biz-error';

export function renderTemplate(value = '', variables = {}) {
	return String(value).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => variables[key] == null ? match : String(variables[key]));
}

const templateService = {
	list(c, userId, type) {
		const where = type ? and(eq(mailTemplate.userId, userId), eq(mailTemplate.type, type)) : eq(mailTemplate.userId, userId);
		return orm(c).select().from(mailTemplate).where(where).orderBy(desc(mailTemplate.updateTime)).all();
	},
	async save(c, params, userId) {
		const values = {
			name: String(params.name || '').trim().slice(0, 100),
			type: params.type === 'snippet' ? 'snippet' : 'template',
			subject: String(params.subject || '').slice(0, 500),
			content: String(params.content || '').slice(0, 100000),
			text: String(params.text || '').slice(0, 50000),
			updateTime: sql`CURRENT_TIMESTAMP`
		};
		if (!values.name) throw new BizError('Template name is required');
		if (params.templateId) {
			return orm(c).update(mailTemplate).set(values).where(and(eq(mailTemplate.templateId, Number(params.templateId)), eq(mailTemplate.userId, userId))).returning().get();
		}
		return orm(c).insert(mailTemplate).values({...values, userId}).returning().get();
	},
	async remove(c, templateId, userId) {
		await orm(c).delete(mailTemplate).where(and(eq(mailTemplate.templateId, Number(templateId)), eq(mailTemplate.userId, userId))).run();
	}
};
export default templateService;
