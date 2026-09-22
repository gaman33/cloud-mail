import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/utils/secret-crypto';

describe('secret crypto', () => {
	it('encrypts and decrypts a provider key without exposing plaintext', async () => {
		const encrypted = await encryptSecret('jwt-secret', 'sk-test-value');
		expect(encrypted).toMatch(/^enc:v1:/);
		expect(encrypted).not.toContain('sk-test-value');
		expect(await decryptSecret('jwt-secret', encrypted)).toBe('sk-test-value');
		expect(await decryptSecret('other-secret', encrypted)).toBe('');
	});
});
