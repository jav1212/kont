import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSameOrigin, resolveBarcodeTerminal, sessionIdFromAccessToken, terminalFromCookie } from './barcode-access-service';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

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

test('browser enrollment survives operator logout and distinguishes failures without granting access', async (t) => {
    const enabled = process.env.KONTAVE_BARCODE_ACCESS_ENABLED;
    process.env.KONTAVE_BARCODE_ACCESS_ENABLED = 'true';
    t.after(() => {
        if (enabled === undefined) delete process.env.KONTAVE_BARCODE_ACCESS_ENABLED;
        else process.env.KONTAVE_BARCODE_ACCESS_ENABLED = enabled;
    });
    const terminal = { id: 'f7a37e83-215c-4f59-9f6a-0b6dfd3cb7d6', tenant_id: 'tenant', status: 'active', protection_ready: true };
    const credential = `${terminal.id}.${'x'.repeat(43)}`;
    let ready = true;
    let lookupError = false;
    let found = true;
    const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: found ? terminal : null, error: lookupError ? { message: 'private database detail' } : null }),
    };
    // No operator auth session is provided: enrollment belongs to the browser.
    t.mock.method(ServerSupabaseSource.prototype, 'connect', () => ({
        rpc: async () => ({ data: ready, error: null }),
        from: () => query,
    }) as unknown as SupabaseClient);

    assert.deepEqual(await resolveBarcodeTerminal(credential), { ready: true, terminal });
    assert.deepEqual(await terminalFromCookie(credential), terminal);
    assert.deepEqual(await resolveBarcodeTerminal(undefined), { ready: false, reason: 'not_enrolled' });
    assert.deepEqual(await resolveBarcodeTerminal('malformed'), { ready: false, reason: 'not_enrolled' });
    found = false;
    assert.deepEqual(await resolveBarcodeTerminal(credential), { ready: false, reason: 'not_enrolled' });
    found = true;
    terminal.status = 'revoked';
    assert.deepEqual(await resolveBarcodeTerminal(credential), { ready: false, reason: 'revoked' });
    assert.equal(await terminalFromCookie(credential), null);
    terminal.status = 'active';
    terminal.protection_ready = false;
    assert.deepEqual(await resolveBarcodeTerminal(credential), { ready: false, reason: 'access_unavailable' });
    terminal.protection_ready = true;
    lookupError = true;
    assert.deepEqual(await resolveBarcodeTerminal(credential), { ready: false, reason: 'access_unavailable' });
    assert.equal(await terminalFromCookie(credential), null);
    lookupError = false;
    ready = false;
    assert.deepEqual(await resolveBarcodeTerminal(credential), { ready: false, reason: 'access_unavailable' });
    ready = true;
    delete process.env.KONTAVE_BARCODE_ACCESS_ENABLED;
    assert.deepEqual(await resolveBarcodeTerminal(credential), { ready: false, reason: 'access_unavailable' });
    assert.equal(await terminalFromCookie(credential), null);
});
