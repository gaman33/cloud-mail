import { describe, expect, it, vi } from 'vitest';
import { configuredWebhookSecrets, verifyWebhookWithSecrets } from '../src/utils/resend-webhook-utils';

describe('Resend webhook verification', () => {
	it('loads exactly the two configured account secrets', () => {
		expect(configuredWebhookSecrets({
			resend_webhook_secret_polyurea: ' whsec_polyurea ',
			resend_webhook_secret_coating: 'whsec_coating',
			resend_webhook_secret: 'whsec_legacy'
		})).toEqual(['whsec_polyurea', 'whsec_coating']);
	});

	it('removes duplicate and empty secrets', () => {
		expect(configuredWebhookSecrets({
			resend_webhook_secret_polyurea: 'whsec_same',
			resend_webhook_secret_coating: 'whsec_same'
		})).toEqual(['whsec_same']);
	});

	it('accepts an event signed by the second Resend account', () => {
		const expectedBody = {type: 'email.delivered', data: {email_id: 'email-2'}};
		const verify = vi.fn(({webhookSecret}) => {
			if (webhookSecret !== 'whsec_coating') throw new Error('invalid signature');
			return expectedBody;
		});
		const resend = {webhooks: {verify}};

		const body = verifyWebhookWithSecrets(
			resend,
			'{"type":"email.delivered"}',
			{id: 'event-id', timestamp: '123', signature: 'signature'},
			['whsec_polyurea', 'whsec_coating']
		);

		expect(body).toBe(expectedBody);
		expect(verify).toHaveBeenCalledTimes(2);
		expect(verify.mock.calls[1][0].webhookSecret).toBe('whsec_coating');
	});

	it('rejects a signature that matches none of the configured accounts', () => {
		const resend = {webhooks: {verify: vi.fn(() => { throw new Error('invalid signature'); })}};
		expect(() => verifyWebhookWithSecrets(
			resend,
			'{}',
			{id: 'event-id', timestamp: '123', signature: 'bad'},
			['whsec_polyurea', 'whsec_coating']
		)).toThrow('did not match any configured secret');
	});
});

