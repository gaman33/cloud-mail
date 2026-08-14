import { describe, expect, it } from 'vitest';
import { buildRawMessage, marketingFromAddress } from '../src/service/ses-service';
import { canonicalMessage, validSnsUrl } from '../src/utils/ses-sns-utils';
import { normalizeType, recipientAddresses } from '../src/service/ses-event-service';

describe('Amazon SES marketing integration', () => {
	it('maps a normal mailbox to its isolated marketing subdomain', () => {
		expect(marketingFromAddress('bojack@turean-polyurea.com')).toBe('marketing@news.turean-polyurea.com');
		expect(marketingFromAddress('jessie@turean-coating.com', 'campaign')).toBe('campaign@news.turean-coating.com');
	});

	it('builds a raw MIME message with reply-to, unsubscribe and attachment', async () => {
		const raw = await buildRawMessage({
			name: '业务员',
			fromEmail: 'marketing@news.turean-coating.com',
			replyTo: 'jessie@turean-coating.com',
			receiveEmail: ['customer@example.com'],
			ccEmail: [],
			subject: '测试营销邮件',
			text: 'hello',
			html: '<p>hello</p>',
			rfcMessageId: '<test@news.turean-coating.com>',
			unsubscribeUrl: 'https://tk.turean-polyurea.com/api/unsubscribe/token'
		}, [{filename: 'quote.txt', contentType: 'text/plain', content: 'aGVsbG8='}]);
		const mime = new TextDecoder().decode(raw);
		expect(mime).toContain('Reply-To: jessie@turean-coating.com');
		expect(mime).toContain('List-Unsubscribe: <https://tk.turean-polyurea.com/api/unsubscribe/token>');
		expect(mime).toContain('filename="quote.txt"');
		expect(mime).toContain('Message-ID: <test@news.turean-coating.com>');
	});

	it('only accepts regional AWS SNS HTTPS URLs', () => {
		expect(validSnsUrl('https://sns.ap-southeast-1.amazonaws.com/cert.pem', 'ap-southeast-1')).toBe(true);
		expect(validSnsUrl('https://sns.us-east-1.amazonaws.com/cert.pem', 'ap-southeast-1')).toBe(false);
		expect(validSnsUrl('https://sns.ap-southeast-1.amazonaws.com.evil.test/cert.pem', 'ap-southeast-1')).toBe(false);
		expect(validSnsUrl('http://sns.ap-southeast-1.amazonaws.com/cert.pem', 'ap-southeast-1')).toBe(false);
	});

	it('uses the AWS-documented canonical SNS field order', () => {
		const canonical = canonicalMessage({Type: 'Notification', Message: 'payload', MessageId: 'id', Timestamp: 'time', TopicArn: 'arn'});
		expect(canonical).toBe('Message\npayload\nMessageId\nid\nTimestamp\ntime\nTopicArn\narn\nType\nNotification\n');
	});

	it('normalizes SES bounce recipients', () => {
		const payload = {eventType: 'Bounce', bounce: {bouncedRecipients: [{emailAddress: 'bad@example.com'}]}};
		expect(normalizeType(payload.eventType)).toBe('BOUNCE');
		expect(recipientAddresses(payload)).toEqual(['bad@example.com']);
	});
});
