import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptBarcodeBadge, encryptBarcodeBadge, hasSameOrigin, issueBarcodeBadge, reprintBarcodeBadge, resolveBarcodeTerminal, sessionIdFromAccessToken, terminalFromCookie } from './barcode-access-service';
import { createHash, randomBytes } from 'node:crypto';
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

test('encrypted badges can only be restored with their original tenant, user, and hash', async (t) => {
    const previous = process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY;
    process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
    t.after(() => {
        if (previous === undefined) delete process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY;
        else process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY = previous;
    });
    const barcode = 'KONT-0123456789abcdefghijkl';
    const input = { tenantId: 'tenant-a', userId: 'user-a', barcode };
    const ciphertext = encryptBarcodeBadge(input);
    const codeHash = createHash('sha256').update(barcode, 'utf8').digest('hex');
    assert.equal(decryptBarcodeBadge({ tenantId: input.tenantId, userId: input.userId, codeHash, ciphertext }), barcode);
    await assert.rejects(async () => decryptBarcodeBadge({ tenantId: 'tenant-b', userId: input.userId, codeHash, ciphertext }), /badge_reprint_unavailable/);
    const tampered = `${ciphertext.slice(0, -1)}${ciphertext.endsWith('A') ? 'B' : 'A'}`;
    await assert.rejects(async () => decryptBarcodeBadge({ tenantId: input.tenantId, userId: input.userId, codeHash, ciphertext: tampered }), /badge_reprint_unavailable/);
});

test('reprinting restores the same active credential without issuing or rotating a badge', async (t) => {
    const previous = process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY;
    process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
    t.after(() => {
        if (previous === undefined) delete process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY;
        else process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY = previous;
    });
    const barcode = 'KONT-0123456789abcdefghijkl';
    const tenantId = 'tenant-a'; const userId = 'user-a';
    const codeHash = createHash('sha256').update(barcode, 'utf8').digest('hex');
    const badge = { id: 'badge-a', tenant_id: tenantId, user_id: userId, status: 'active', created_at: '2026-01-01T00:00:00.000Z', revoked_at: null, code_hash: codeHash, code_ciphertext: encryptBarcodeBadge({ tenantId, userId, barcode }) };
    let auditCalls = 0;
    const membership = { select: () => membership, eq: () => membership, not: () => membership, is: () => membership, maybeSingle: async () => ({ data: { id: 'membership' }, error: null }) };
    const target = { select: () => target, eq: () => target, maybeSingle: async () => ({ data: badge, error: null }) };
    const admin = { select: () => admin, eq: () => admin, maybeSingle: async () => ({ data: null, error: null }) };
    t.mock.method(ServerSupabaseSource.prototype, 'connect', () => ({
        from: (table: string) => table === 'barcode_access_badges' ? target : table === 'tenant_memberships' ? membership : table === 'admin_users' ? admin : table === 'barcode_access_audit' ? { insert: async () => { auditCalls += 1; return { error: null }; } } : (() => { throw new Error(`Unexpected table: ${table}`); })(),
        rpc: async () => { throw new Error('A reprint must not issue or rotate a badge'); },
        auth: { admin: { getUserById: async () => ({ data: { user: { email: 'holder@example.test', email_confirmed_at: '2026-01-01T00:00:00.000Z', banned_until: null, deleted_at: null, factors: [] } }, error: null }) } },
    }) as unknown as SupabaseClient);
    const printed = await reprintBarcodeBadge({ tenantId, badgeId: badge.id, actorId: 'actor-a' });
    assert.equal(printed.barcode, barcode);
    assert.equal(printed.badge.id, badge.id);
    assert.equal(auditCalls, 1);
});

test('reprinting denies revoked, foreign, and legacy badges without revealing a credential', async (t) => {
    const previous = process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY;
    process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
    t.after(() => {
        if (previous === undefined) delete process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY;
        else process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY = previous;
    });
    const membership = { select: () => membership, eq: () => membership, not: () => membership, is: () => membership, maybeSingle: async () => ({ data: { id: 'membership' }, error: null }) };
    let row: Record<string, unknown> | null = { id: 'badge-a', tenant_id: 'tenant-a', user_id: 'user-a', status: 'revoked', code_ciphertext: 'unused' };
    const target = { select: () => target, eq: () => target, maybeSingle: async () => ({ data: row, error: null }) };
    t.mock.method(ServerSupabaseSource.prototype, 'connect', () => ({ from: (table: string) => table === 'barcode_access_badges' ? target : membership }) as unknown as SupabaseClient);
    await assert.rejects(reprintBarcodeBadge({ tenantId: 'tenant-a', badgeId: 'badge-a', actorId: 'actor-a' }), /badge_reprint_unavailable/);
    row = null;
    await assert.rejects(reprintBarcodeBadge({ tenantId: 'tenant-b', badgeId: 'badge-a', actorId: 'actor-a' }), /badge_reprint_unavailable/);
    row = { id: 'badge-a', tenant_id: 'tenant-a', user_id: 'user-a', status: 'active', code_ciphertext: null };
    await assert.rejects(reprintBarcodeBadge({ tenantId: 'tenant-a', badgeId: 'badge-a', actorId: 'actor-a' }), /badge_reprint_legacy/);
});

test('a missing reprint key prevents issuance before the atomic badge RPC', async (t) => {
    const previous = process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY;
    delete process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY;
    t.after(() => { if (previous !== undefined) process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY = previous; });
    let rpcCalls = 0;
    const membership = { select: () => membership, eq: () => membership, not: () => membership, is: () => membership, maybeSingle: async () => ({ data: { id: 'membership' }, error: null }) };
    const admin = { select: () => admin, eq: () => admin, maybeSingle: async () => ({ data: null, error: null }) };
    t.mock.method(ServerSupabaseSource.prototype, 'connect', () => ({
        from: (table: string) => table === 'tenant_memberships' ? membership : admin,
        rpc: async () => { rpcCalls += 1; return { data: null, error: null }; },
        auth: { admin: { getUserById: async () => ({ data: { user: { email: 'holder@example.test', email_confirmed_at: '2026-01-01T00:00:00.000Z', banned_until: null, deleted_at: null, factors: [] } }, error: null }) } },
    }) as unknown as SupabaseClient);
    await assert.rejects(issueBarcodeBadge({ tenantId: 'tenant-a', userId: 'user-a', actorId: 'actor-a' }), /badge_reprint_unavailable/);
    assert.equal(rpcCalls, 0);
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
