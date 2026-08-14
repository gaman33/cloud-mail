import { describe, expect, it } from 'vitest';
import { sanitizeSignatureHtml } from '../src/service/account-service';
import { appendAccountSignature, normalizeRecipientFields } from '../src/service/email-service';
import { parseReadReceipt } from '../src/service/tracking-service';
import { renderTemplate } from '../src/service/template-service';

describe('phase two helpers', () => {
	it('sanitizes dangerous signature markup', () => {
		const value = sanitizeSignatureHtml('<b onclick="alert(1)">Team</b><script>alert(2)</script><a href="javascript:x">link</a>');
		expect(value).toContain('<b>Team</b>');
		expect(value).not.toContain('script');
		expect(value).not.toContain('onclick');
		expect(value).not.toContain('javascript:');
	});

	it('appends enabled signatures and honors reply preference', () => {
		const account = {signatureEnabled: 1, signatureOnReply: 1, signatureHtml: '<b>Alice</b>', signatureText: 'Alice'};
		expect(appendAccountSignature('<p>Hello</p>', 'Hello', account, 'new').html).toContain('data-cloud-mail-signature');
		expect(appendAccountSignature('', '', {...account, signatureOnReply: 0}, 'reply').html).toBe('');
		expect(appendAccountSignature('<p>Hello</p>', 'Hello', account, 'new', false).html).toBe('<p>Hello</p>');
	});

	it('separates primary and cc recipients and removes duplicates', () => {
		const recipients = normalizeRecipientFields(
			['Customer@example.com'],
			['sales@example.com', 'customer@example.com']
		);
		expect(recipients).toEqual({
			receiveEmail: ['Customer@example.com'],
			ccEmail: ['sales@example.com']
		});
	});

	it('recognizes standards-based displayed MDN receipts', () => {
		const raw = 'Original-Message-ID: <abc@example.com>\r\nDisposition: manual-action/MDN-sent-manually; displayed\r\n';
		const parsed = {headers: [{key: 'content-type', value: 'multipart/report; report-type=disposition-notification'}]};
		expect(parseReadReceipt(raw, parsed)).toEqual({messageId: '<abc@example.com>', disposition: 'manual-action/MDN-sent-manually; displayed'});
	});

	it('ignores ordinary messages and failed notifications', () => {
		expect(parseReadReceipt('hello', {headers: [{key: 'content-type', value: 'text/plain'}]})).toBeNull();
	});

	it('renders known template variables and preserves unknown variables', () => {
		expect(renderTemplate('Hello {{ customer_name }} from {{company}} / {{missing}}', {customer_name: 'Alice', company: 'Acme'}))
			.toBe('Hello Alice from Acme / {{missing}}');
	});
});
