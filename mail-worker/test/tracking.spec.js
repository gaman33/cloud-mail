import { describe, expect, it } from 'vitest';
import trackingService, { buildTrackedHtml, rewriteTrackedLinks } from '../src/service/tracking-service';

describe('email tracking helpers', () => {
	it('injects the tracking pixel before the closing body tag', () => {
		const html = '<html><body><p>Hello</p></body></html>';
		const result = buildTrackedHtml(html, 'https://mail.example/api/track/open/token.gif');
		expect(result).toContain('<p>Hello</p><img');
		expect(result).toContain('src="https://mail.example/api/track/open/token.gif"');
		expect(result.indexOf('<img')).toBeLessThan(result.indexOf('</body>'));
	});

	it('does not alter empty or text-only content', () => {
		expect(buildTrackedHtml('', 'https://mail.example/pixel.gif')).toBe('');
		expect(buildTrackedHtml('<p>Hello</p>', '')).toBe('<p>Hello</p>');
	});

	it('generates high-entropy URL-safe tokens', () => {
		const first = trackingService.newToken();
		const second = trackingService.newToken();
		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(first).not.toBe(second);
	});

	it('generates stable and recipient-specific tokens for idempotent retries', async () => {
		const c = {env: {jwt_secret: 'unit-test-secret'}};
		const first = await trackingService.idempotentToken(c, 'send-1:alice@example.com');
		const retry = await trackingService.idempotentToken(c, 'send-1:alice@example.com');
		const other = await trackingService.idempotentToken(c, 'send-1:bob@example.com');
		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(first).toBe(retry);
		expect(first).not.toBe(other);
	});

	it('uses the configured tracking domain', () => {
		const c = { req: { url: 'https://worker.example/api/email/send' } };
		expect(trackingService.openUrl(c, 'links.example.com', 'abc'))
			.toBe('https://links.example.com/api/track/open/abc.gif');
	});

	it('rewrites web links while preserving unsubscribe and non-web links', () => {
		const html = '<a href="https://example.com/a?q=1">Web</a><a href="https://mail.example/api/unsubscribe/x">Stop</a><a href="mailto:a@example.com">Mail</a>';
		const result = rewriteTrackedLinks(html, 'https://mail.example/api/track/click', 'token');
		expect(result).toContain('https://mail.example/api/track/click/token?url=https%3A%2F%2Fexample.com%2Fa%3Fq%3D1');
		expect(result).toContain('href="https://mail.example/api/unsubscribe/x"');
		expect(result).toContain('href="mailto:a@example.com"');
	});
});
