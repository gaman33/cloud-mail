import http from '@/axios/index.js';

export function aiDraft(payload) {
    return http.post('/ai/draft', payload, {noMsg: true, timeout: 65000});
}
