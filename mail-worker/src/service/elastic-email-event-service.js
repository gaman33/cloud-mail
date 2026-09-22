import trackingService from './tracking-service';
import reliabilityService from './reliability-service';
import emailService from './email-service';
import { emailConst } from '../const/entity-const';

const DEFAULT_API_BASE_URL = 'https://api.elasticemail.com/v4';
const CURSOR_KEY = 'elastic-email:event-cursor';
const EVENT_TYPES = ['Sent', 'FailedAttempt', 'Error', 'Unsubscribe', 'Complaint', 'Bounce', 'TransactionalUnsubscribe', 'Suppress'];

const EVENT_MAP = {
	Sent: {eventType: 'delivered', status: emailConst.status.DELIVERED},
	FailedAttempt: {eventType: 'delivery_delayed', status: emailConst.status.DELAYED},
	Error: {eventType: 'failed', status: emailConst.status.FAILED},
	Unsubscribe: {eventType: 'unsubscribed', suppress: 'unsubscribe'},
	TransactionalUnsubscribe: {eventType: 'unsubscribed', suppress: 'unsubscribe'},
	Complaint: {eventType: 'complained', status: emailConst.status.COMPLAINED, suppress: 'complaint'},
	Bounce: {eventType: 'bounced', status: emailConst.status.BOUNCED, suppress: 'bounce'},
	Suppress: {eventType: 'bounced', status: emailConst.status.BOUNCED, suppress: 'suppressed'}
};

async function eventId(event) {
	const input = [event.TransactionID, event.MsgID, event.EventType, event.EventDate, event.To].join('|');
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return `elastic:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function loadEvents(env, from, to, offset = 0) {
	const baseUrl = String(env.ELASTIC_EMAIL_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
	const url = new URL(`${baseUrl}/events`);
	for (const type of EVENT_TYPES) url.searchParams.append('eventTypes', type);
	url.searchParams.set('from', from);
	url.searchParams.set('to', to);
	url.searchParams.set('orderBy', 'DateAscending');
	url.searchParams.set('limit', '1000');
	url.searchParams.set('offset', String(offset));
	const response = await fetch(url, {headers: {'X-ElasticEmail-ApiKey': env.ELASTIC_EMAIL_API_KEY}});
	if (!response.ok) throw new Error(`Elastic Email events HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
	return response.json();
}

const elasticEmailEventService = {
	async handle(c, event) {
		const mapping = EVENT_MAP[event.EventType];
		if (!mapping || !event.TransactionID) return null;
		const body = {
			type: `email.${mapping.eventType}`,
			created_at: event.EventDate || new Date().toISOString(),
			data: {
				email_id: event.TransactionID,
				to: event.To || '',
				failed: {
					type: event.EventType,
					category: event.MessageCategory || '',
					message: event.Message || ''
				}
			}
		};
		const emailRow = await trackingService.recordProviderEvent(c, body, await eventId(event), 'elastic_email');
		if (!emailRow) return null;
		if (mapping.suppress && event.To) {
			await reliabilityService.suppress(c, emailRow.userId, event.To, mapping.suppress, 'elastic_email');
		}
		if (mapping.status !== undefined) {
			await emailService.updateEmailStatus(c, {
				resendEmailId: event.TransactionID,
				provider: 'elastic_email',
				status: mapping.status,
				message: event.Message || event.MessageCategory || ''
			});
		}
		return emailRow;
	},

	async sync(c) {
		if (c.env.ELASTIC_EMAIL_ENABLED !== 'true' || !c.env.ELASTIC_EMAIL_API_KEY || !c.env.kv) return 0;
		const to = new Date().toISOString();
		const storedCursor = await c.env.kv.get(CURSOR_KEY);
		const fromDate = storedCursor ? new Date(storedCursor) : new Date(Date.now() - 10 * 60_000);
		fromDate.setMinutes(fromDate.getMinutes() - 2);
		let offset = 0;
		let processed = 0;
		while (true) {
			const events = await loadEvents(c.env, fromDate.toISOString(), to, offset);
			for (const event of events) {
				await this.handle(c, event);
				processed++;
			}
			if (events.length < 1000) break;
			offset += events.length;
		}
		await c.env.kv.put(CURSOR_KEY, to, {expirationTtl: 60 * 60 * 24 * 30});
		return processed;
	}
};

export { EVENT_MAP, eventId };
export default elasticEmailEventService;
