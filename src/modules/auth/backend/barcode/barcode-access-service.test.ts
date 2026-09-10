import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSameOrigin, sessionIdFromAccessToken } from './barcode-access-service';

/** Encodes a deliberately unsigned JWT-shaped value for claim parser coverage. */
function tokenWithPayload(payload: object): string {
    return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

test('extracts only a UUID Supabase session claim', () => {
    const sessionId = 'f7a37e83-215c-4f59-9f6a-0b6dfd3cb7d6';
    assert.equal(sessionIdFromAccessToken(tokenWithPayload({ session_id: sessionId })), sessionId);
    assert.equal(sessionIdFromAccessToken(tokenWithPayload({ session_id: 'not-a-uuid' })), null);
    assert.equal(sessionIdFromAccessToken('not-a-jwt'), null);
});

test('rejects cross-origin cookie mutations', () => {
    const sameOrigin = new Request('https://kont.example/api/auth/barcode', { headers: { origin: 'https://kont.example' } });
    const foreignOrigin = new Request('https://kont.example/api/auth/barcode', { headers: { origin: 'https://attacker.example' } });
    assert.equal(hasSameOrigin(sameOrigin), true);
    assert.equal(hasSameOrigin(foreignOrigin), false);
    assert.equal(hasSameOrigin(new Request('https://kont.example/api/auth/barcode')), false);
});
