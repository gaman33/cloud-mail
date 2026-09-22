import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildElasticEmailRequest, marketingFromAddress } from '../src/service/elastic-email-service';
import { EVENT_MAP, eventId, loadEvents } from '../src/service/elastic-email-event-service';

afterEach(() => vi.unstubAllGlobals());

describe('Elastic Email marketing integration', () => {
	it('maps a mailbox to its verified marketing subdomain', () => {
		expect(marketingFromAddress('bojack@turean-polyurea.com')).toBe('marketing@news.turean-polyurea.com');
		expect(marketingFromAddress('jessie@turean-coating.com', 'campaign')).toBe('campaign@news.turean-coating.com');
	});

	it('builds a per-recipient request with tracking disabled at the provider', () => {
		const request = buildElasticEmailRequest({
			name: 'Sales',
			accountEmail: 'jessie@turean-coating.com',
			receiveEmail: ['customer@example.com'],
			ccEmail: [],
			subject: 'Hello',
			text: 'Plain text',
			html: '<p>Plain text</p>',
			idempotencyKey: 'job-1',
			unsubscribeUrl: 'https://tk.turean-polyurea.com/api/unsubscribe/token'
		}, [{filename: 'quote.txt', contentType: 'text/plain', content: 'aGVsbG8='}]);
		expect(request.path).toBe('/emails');
		expect(request.payload.Recipients).toEqual([{Email: 'customer@example.com'}]);
		expect(request.payload.Options).toMatchObject({TrackOpens: 'false', TrackClicks: 'false'});
		expect(request.payload.Content.Headers['List-Unsubscribe']).toContain('/api/unsubscribe/token');
		expect(request.payload.Content.Attachments[0]).toMatchObject({Name: 'quote.txt', BinaryContent: 'aGVsbG8='});
	});

	it('uses the transactional endpoint when Cc recipients are present', () => {
		const request = buildElasticEmailRequest({
			accountEmail: 'jessie@turean-coating.com',
			receiveEmail: ['customer@example.com'],
			ccEmail: ['manager@example.com'],
			subject: 'Hello',
			text: 'Hello'
		});
		expect(request.path).toBe('/emails/transactional');
		expect(request.payload.Recipients).toEqual({To: ['customer@example.com'], CC: ['manager@example.com'], BCC: []});
	});

	it('maps compliance events to local status and suppression behavior', () => {
		expect(EVENT_MAP.Sent).toMatchObject({eventType: 'delivered'});
		expect(EVENT_MAP.Bounce).toMatchObject({eventType: 'bounced', suppress: 'bounce'});
		expect(EVENT_MAP.Complaint).toMatchObject({eventType: 'complained', suppress: 'complaint'});
		expect(EVENT_MAP.Unsubscribe).toMatchObject({eventType: 'unsubscribed', suppress: 'unsubscribe'});
	});

	it('creates stable provider event IDs', async () => {
		const event = {TransactionID: 'tx', MsgID: 'msg', EventType: 'Bounce', EventDate: '2026-01-01T00:00:00Z', To: 'bad@example.com'};
		expect(await eventId(event)).toBe(await eventId(event));
		expect(await eventId({...event, EventType: 'Complaint'})).not.toBe(await eventId(event));
	});

	it('loads compliance events with the report permission API key', async () => {
		let requestedUrl;
		let requestedOptions;
		vi.stubGlobal('fetch', async (url, options) => {
			requestedUrl = new URL(url);
			requestedOptions = options;
			return new Response('[]', {status: 200, headers: {'content-type': 'application/json'}});
		});
		await loadEvents({ELASTIC_EMAIL_API_KEY: 'test-key'}, '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z');
		expect(requestedOptions.headers['X-ElasticEmail-ApiKey']).toBe('test-key');
		expect(requestedUrl.pathname).toBe('/v4/events');
		expect(requestedUrl.searchParams.getAll('eventTypes')).toContain('Complaint');
		expect(requestedUrl.searchParams.getAll('eventTypes')).toContain('Unsubscribe');
	});
});
