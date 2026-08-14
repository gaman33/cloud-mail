import { and, asc, eq, inArray, or } from 'drizzle-orm';
import orm from '../entity/orm';
import email from '../entity/email';
import emailTracking from '../entity/email-tracking';
import emailEvent from '../entity/email-event';
import reqUtils from '../utils/req-utils';
import BizError from '../error/biz-error';

const TRACKING_PIXEL = Uint8Array.from(atob('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='), c => c.charCodeAt(0));

function escapeAttribute(value) {
	return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function buildTrackedHtml(html, trackingUrl) {
	if (!html || !trackingUrl) return html;
	const pixel = `<img src="${escapeAttribute(trackingUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`;
	return /<\/body\s*>/i.test(html)
		? html.replace(/<\/body\s*>/i, `${pixel}</body>`)
		: `${html}${pixel}`;
}

export function rewriteTrackedLinks(html, clickBaseUrl, token) {
	if (!html || !clickBaseUrl || !token) return html;
	return String(html).replace(/href=(['"])(https?:\/\/[^'"\s>]+)\1/gi, (match, quote, url) => {
		if (/\/api\/(?:unsubscribe|track)\//i.test(url)) return match;
		return `href=${quote}${clickBaseUrl}/${token}?url=${encodeURIComponent(url.replace(/&amp;/gi, '&'))}${quote}`;
	});
}

function normalizeEventType(type) {
	return String(type || '').replace(/^email\./, '');
}

function normalizeMessageId(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	return raw.startsWith('<') ? raw : `<${raw}>`;
}

export function parseReadReceipt(raw, parsedEmail = {}) {
	const contentType = parsedEmail.headers?.find(item => String(item.key).toLowerCase() === 'content-type')?.value || '';
	if (!/disposition-notification|multipart\/report/i.test(contentType)) return null;
	const original = String(raw || '').match(/^Original-Message-ID:\s*(.+)$/im)?.[1]?.trim();
	const disposition = String(raw || '').match(/^Disposition:\s*(.+)$/im)?.[1]?.trim() || '';
	if (!original || !/displayed|dispatched|processed/i.test(disposition)) return null;
	return {messageId: normalizeMessageId(original), disposition};
}

function eventClientData(c, data = {}) {
	const click = data.click || {};
	const userAgent = click.userAgent || c.req.header('user-agent') || '';
	const parsed = reqUtils.parseUserAgent(userAgent);
	const cf = c.req.raw.cf || {};
	return {
		ip: click.ipAddress || reqUtils.getIp(c),
		country: cf.country || '',
		region: cf.region || '',
		city: cf.city || '',
		userAgent,
		browser: parsed.browser,
		os: parsed.os,
		device: parsed.device,
		url: click.link || ''
	};
}

const trackingService = {
	newToken() {
		return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
	},

	async idempotentToken(c, idempotencyKey) {
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(c.env.jwt_secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const signature = await crypto.subtle.sign(
			'HMAC',
			key,
			encoder.encode(`cloud-mail-tracking:${idempotencyKey}`)
		);
		return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
	},

	trackingOrigin(c, customDomain) {
		let origin = customDomain || c.env.custom_domain || (c.req ? new URL(c.req.url).origin : '');
		if (!origin) throw new BizError('Custom domain is required for background email tracking', 500);
		if (!/^https?:\/\//i.test(origin)) origin = `https://${origin}`;
		return origin.replace(/\/$/, '');
	},

	openUrl(c, customDomain, token) {
		return `${this.trackingOrigin(c, customDomain)}/api/track/open/${token}.gif`;
	},

	async createTracking(c, { emailId, userId, recipientEmail, token, providerEmailId, provider = 'resend' }) {
		return orm(c).insert(emailTracking).values({
			emailId,
			userId,
			recipientEmail,
			token,
			providerEmailId,
			provider
		}).returning().get();
	},

	async recordInitial(c, tracking, eventType, eventTime = new Date().toISOString()) {
		await orm(c).insert(emailEvent).values({
			emailId: tracking.emailId,
			trackingId: tracking.trackingId,
			userId: tracking.userId,
			recipientEmail: tracking.recipientEmail,
			eventType,
			eventTime,
			source: 'cloud_mail'
		}).run();
	},

	async recordOpen(c, token) {
		const tracking = await orm(c).select().from(emailTracking).where(eq(emailTracking.token, token)).get();
		if (!tracking) return false;
		const client = eventClientData(c);
		await orm(c).insert(emailEvent).values({
			emailId: tracking.emailId,
			trackingId: tracking.trackingId,
			userId: tracking.userId,
			recipientEmail: tracking.recipientEmail,
			eventType: 'opened',
			eventTime: new Date().toISOString(),
			...client,
			source: 'tracking_pixel'
		}).run();
		return true;
	},

	async recordClick(c, token, url) {
		const tracking = await orm(c).select().from(emailTracking).where(eq(emailTracking.token, token)).get();
		if (!tracking) return false;
		const client = eventClientData(c, {click: {link: url}});
		await orm(c).insert(emailEvent).values({
			emailId: tracking.emailId,
			trackingId: tracking.trackingId,
			userId: tracking.userId,
			recipientEmail: tracking.recipientEmail,
			eventType: 'clicked',
			eventTime: new Date().toISOString(),
			...client,
			source: 'tracking_redirect'
		}).run();
		return true;
	},

	async recordProviderEvent(c, body, providerEventId, provider = 'resend') {
		const data = body.data || {};
		const emailRow = await orm(c).select().from(email).where(and(
			eq(email.resendEmailId, data.email_id),
			eq(email.provider, provider)
		)).get();
		if (!emailRow) return null;
		if (data.message_id && normalizeMessageId(data.message_id) !== normalizeMessageId(emailRow.messageId)) {
			await orm(c).update(email).set({messageId: normalizeMessageId(data.message_id)}).where(eq(email.emailId, emailRow.emailId)).run();
			emailRow.messageId = normalizeMessageId(data.message_id);
		}

		const tracking = await orm(c).select().from(emailTracking)
			.where(eq(emailTracking.emailId, emailRow.emailId)).get();
		const client = eventClientData(c, data);
		const recipientEmail = Array.isArray(data.to) ? (data.to[0] || '') : (data.to || tracking?.recipientEmail || '');
		const eventTime = data.click?.timestamp || body.created_at || new Date().toISOString();
		const eventType = normalizeEventType(body.type);
		if (tracking && ['opened', 'clicked'].includes(eventType)) return emailRow;

		await orm(c).insert(emailEvent).values({
			emailId: emailRow.emailId,
			trackingId: tracking?.trackingId,
			userId: emailRow.userId,
			recipientEmail,
			providerEventId,
			eventType,
			eventTime,
			...client,
			source: provider,
			metadata: JSON.stringify(data.bounce || data.failed || {})
		}).onConflictDoNothing().run();

		return emailRow;
	},

	async recordReadReceipt(c, raw, parsedEmail, accountId) {
		const receipt = parseReadReceipt(raw, parsedEmail);
		if (!receipt) return null;
		const bare = receipt.messageId.replace(/^<|>$/g, '');
		const emailRow = await orm(c).select().from(email).where(and(
			eq(email.readReceiptRequested, 1),
			eq(email.accountId, accountId),
			or(eq(email.messageId, receipt.messageId), eq(email.messageId, bare))
		)).get();
		if (!emailRow) return null;
		const tracking = await orm(c).select().from(emailTracking).where(eq(emailTracking.emailId, emailRow.emailId)).get();
		await orm(c).insert(emailEvent).values({
			emailId: emailRow.emailId,
			trackingId: tracking?.trackingId,
			userId: emailRow.userId,
			recipientEmail: parsedEmail?.from?.address || tracking?.recipientEmail || '',
			eventType: 'read_receipt',
			eventTime: parsedEmail?.date || new Date().toISOString(),
			source: 'mdn',
			metadata: JSON.stringify({disposition: receipt.disposition, messageId: receipt.messageId})
		}).run();
		return emailRow;
	},

	async details(c, emailId, userId) {
		emailId = Number(emailId);
		const emailRow = await orm(c).select().from(email).where(and(
			eq(email.emailId, emailId),
			eq(email.userId, userId)
		)).get();
		if (!emailRow) throw new BizError('Email not found', 404);

		const [tracking, events] = await Promise.all([
			orm(c).select().from(emailTracking).where(eq(emailTracking.emailId, emailId)).get(),
			orm(c).select().from(emailEvent).where(eq(emailEvent.emailId, emailId)).orderBy(asc(emailEvent.eventTime)).all()
		]);
		const opens = events.filter(item => item.eventType === 'opened');
		const clicks = events.filter(item => item.eventType === 'clicked');
		return {
			recipientEmail: tracking?.recipientEmail || '',
			tracked: !!tracking,
			openCount: opens.length,
			clickCount: clicks.length,
			firstOpenTime: opens[0]?.eventTime || null,
			lastOpenTime: opens.at(-1)?.eventTime || null,
			firstClickTime: clicks[0]?.eventTime || null,
			lastClickTime: clicks.at(-1)?.eventTime || null,
			events
		};
	},

	async removeByEmailIds(c, emailIds) {
		if (!emailIds?.length) return;
		await orm(c).delete(emailEvent).where(inArray(emailEvent.emailId, emailIds)).run();
		await orm(c).delete(emailTracking).where(inArray(emailTracking.emailId, emailIds)).run();
	},

	async removeByUserIds(c, userIds) {
		if (!userIds?.length) return;
		await orm(c).delete(emailEvent).where(inArray(emailEvent.userId, userIds)).run();
		await orm(c).delete(emailTracking).where(inArray(emailTracking.userId, userIds)).run();
	},

	async purgeExpired(c, days = 90) {
		days = Math.max(7, Math.min(3650, Number(days) || 90));
		await c.env.db.prepare(`DELETE FROM email_event WHERE create_time < datetime('now', ?)`)
			.bind(`-${days} days`).run();
	},

	pixelResponse(c) {
		return c.body(TRACKING_PIXEL, 200, {
			'Content-Type': 'image/gif',
			'Content-Length': String(TRACKING_PIXEL.byteLength),
			'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
			'Pragma': 'no-cache',
			'X-Content-Type-Options': 'nosniff',
			'Cross-Origin-Resource-Policy': 'cross-origin'
		});
	}
};

export default trackingService;
