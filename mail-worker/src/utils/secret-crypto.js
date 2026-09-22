const encoder = new TextEncoder();

function bytesToBase64(bytes) {
	let binary = '';
	for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	return btoa(binary);
}

function base64ToBytes(value) {
	const binary = atob(String(value || ''));
	return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function secretKey(secret) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(secret || '')));
	return crypto.subtle.importKey('raw', digest, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(secret, value) {
	const text = String(value || '').trim();
	if (!text) return '';
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await secretKey(secret), encoder.encode(text));
	return `enc:v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipher))}`;
}

export async function decryptSecret(secret, value) {
	const text = String(value || '');
	if (!text.startsWith('enc:v1:')) return text;
	const [, version, ivValue, cipherValue] = text.split(':');
	if (version !== 'v1' || !ivValue || !cipherValue) return '';
	try {
		const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: base64ToBytes(ivValue)}, await secretKey(secret), base64ToBytes(cipherValue));
		return new TextDecoder().decode(plain);
	} catch { return ''; }
}
