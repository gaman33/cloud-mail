import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import dayjs from 'dayjs';

function parseJsonObject(value) {
	if (value && typeof value === 'object') return value;
	const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
	try { return JSON.parse(text); } catch {}
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	try { return JSON.parse(match[0]); } catch { return null; }
}

function sanitizeHtml(value) {
	return String(value || '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
		.replace(/(?:href|src)\s*=\s*(['"])\s*javascript:[^'\"]*\1/gi, '$1#$1');
}

function textToHtml(value) {
	return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])).replace(/\r?\n/g, '<br>');
}

const aiService = {
	async extractCode(c, email, options = {}) {
		if (!this.shouldExtractCode(options.aiCode, options.aiCodeFilter, email)) {
			return '';
		}

		const ai = c.env.ai;

		try {
			const subject = email.subject || '';
			const text = emailUtils.formatText(email.text || '');
			const htmlText = emailUtils.htmlToText(email.html || '');
			const body = (htmlText || text).slice(0, 6000);

			if (!subject && !body) {
				return '';
			}

			const result = await ai.run(c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct', {
				messages: [
					{
						role: 'system',
						content: 'You extract verification codes from emails. Return only JSON like {"code":"12345678"} or {"code":""}. The code must be 8 characters or fewer and must not contain spaces. If the code is longer than 8 characters or contains spaces, return {"code":""}. Do not explain.'
					},
					{
						role: 'user',
						content: `Subject: ${subject}\n\n${body}`
					}
				],
				temperature: 0,
				max_tokens: 32
			});

			const content = typeof result === 'string' ? result : result?.response || '';
			const json = parseJsonObject(content);
			if (!json) return '';
			if (typeof json.code !== 'string') {
				return '';
			}

			if (json.code.length > 8 || /\s/.test(json.code)) {
				return '';
			}

			return json.code;
		} catch (e) {
			console.error('验证码提取失败: ', e);
			return '';
		}
	},

	async draft(c, params = {}, userId) {
		const baseUrl = String(c.env.AI_PROVIDER_BASE_URL || 'https://api.zetaapi.ai/v1').replace(/\/$/, '');
		const apiKey = String(c.env.AI_PROVIDER_API_KEY || '').trim();
		if (!apiKey) throw new Error('AI provider API key is not configured');
		const model = String(c.env.AI_PROVIDER_MODEL || 'gpt-4o-mini').trim();
		const limit = Math.max(1, Number(c.env.AI_REQUESTS_PER_MINUTE || 10));
		const bucket = `ai-draft:${userId}:${dayjs().format('YYYYMMDDHHmm')}`;
		const used = Number(await c.env.kv.get(bucket) || 0);
		if (used >= limit) throw new Error(`AI request limit reached (${limit}/minute)`);
		await c.env.kv.put(bucket, String(used + 1), {expirationTtl: 120});

		const fields = {
			company: String(params.company || '').slice(0, 300),
			contactName: String(params.contactName || '').slice(0, 120),
			industry: String(params.industry || '').slice(0, 160),
			product: String(params.product || '').slice(0, 500),
			language: String(params.language || 'English').slice(0, 40),
			tone: String(params.tone || 'professional').slice(0, 80),
			goal: String(params.goal || '').slice(0, 300)
		};
		if (!fields.company && !fields.contactName && !fields.product) throw new Error('Company, contact name or product is required');
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), Math.min(60000, Math.max(5000, Number(c.env.AI_PROVIDER_TIMEOUT_MS || 30000))));
		try {
			const response = await fetch(`${baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
				body: JSON.stringify({model, temperature: 0.4, max_tokens: 1200, messages: [
					{role: 'system', content: 'You write compliant B2B sales outreach emails. Use only the supplied facts; never invent certifications, pricing, partnerships, or claims. Return JSON only with keys subject, text, html. Keep it concise and include a clear, low-pressure call to action.'},
					{role: 'user', content: JSON.stringify(fields)}
				]}),
				signal: controller.signal
			});
			if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
			const payload = await response.json();
			const content = payload?.choices?.[0]?.message?.content;
			const draft = parseJsonObject(content);
			if (!draft || !draft.subject || (!draft.text && !draft.html)) throw new Error('AI provider returned an invalid draft');
			const text = String(draft.text || '').slice(0, 12000);
			const html = sanitizeHtml(String(draft.html || textToHtml(text)).slice(0, 20000));
			return {subject: String(draft.subject).slice(0, 300), text, html, model};
		} finally { clearTimeout(timeout); }
	},

	shouldExtractCode(aiCode, aiCodeFilterStr, email) {
		if (aiCode !== settingConst.aiCode.OPEN) {
			return false;
		}

		const filterList = aiCodeFilterStr ? aiCodeFilterStr.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];

		if (filterList.length === 0) {
			return true;
		}

		const fromEmail = (email.from?.address || '').trim().toLowerCase();
		const fromDomain = emailUtils.getDomain(fromEmail).toLowerCase();

		return filterList.some(item => item === fromEmail || item === fromDomain);
	}
};

export default aiService;
