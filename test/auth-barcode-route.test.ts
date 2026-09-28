import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let badgeTenantId = 'organization-a';
let tenantResolution: string | Error = new Error('barcode_session_locked');
let registeredScope: { registered: boolean; tenantId?: string } = { registered: true, tenantId: 'organization-a' };
let linkCalls = 0;
let hasSessionCookie = true;
let verifyOtpCalls = 0;
let signOutCalls = 0;

const sessionId = '11111111-1111-4111-8111-111111111111';
const accessToken = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url')}.`;

mock.module('next/headers', {
    namedExports: {
        cookies: async () => ({ getAll: () => hasSessionCookie ? [{ name: 'sb-test-auth-token', value: 'verified-session' }] : [] }),
    },
});

mock.module('@supabase/ssr', {
    namedExports: {
        createServerClient: () => ({
            auth: {
                getUser: async () => ({ data: { user: { id: 'prior-operator' } }, error: null }),
                getClaims: async () => ({ data: { claims: { sub: 'prior-operator', session_id: sessionId } }, error: null }),
                verifyOtp: async () => {
                    verifyOtpCalls += 1;
                    return { data: { session: { access_token: accessToken }, user: { id: 'badge-operator' } }, error: null };
                },
                signOut: async () => {
                    signOutCalls += 1;
                    return { error: null };
                },
            },
        }),
    },
});

mock.module('@/src/modules/auth/backend/barcode/barcode-access-service', {
    namedExports: {
        barcodeRateLimit: async () => null,
        hasSameOrigin: () => true,
        isBarcodeAccessProtectionReady: async () => true,
        recordBarcodeLoginDenial: async () => {},
        sessionIdFromAccessToken: () => sessionId,
        validateBarcodeAccessSession: async () => ({ ...registeredScope, active: false }),
    },
});

mock.module('@/src/shared/backend/utils/require-tenant', {
    namedExports: {
        requireTenant: async () => {
            if (tenantResolution instanceof Error) throw tenantResolution;
            return { tenantId: tenantResolution };
        },
    },
});

mock.module('@/src/modules/auth/backend/barcode/barcode-access-factory', {
    namedExports: {
        getBarcodeAccessActions: () => ({
            findLoginBadge: { execute: async () => ({ isFailure: false, getValue: () => ({ id: 'badge-id', userId: 'badge-operator', tenantId: badgeTenantId }) }) },
            registerSession: { execute: async () => ({ isFailure: false, getValue: () => ({ id: 'registry-id', expiresAt: '2026-12-01T00:00:00.000Z' }) }) },
        }),
    },
});

mock.module('@/src/shared/backend/source/infra/server-supabase', {
    namedExports: {
        ServerSupabaseSource: class {
            readonly instance = {
                from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
                auth: {
                    admin: {
                        getUserById: async () => ({ data: { user: { email: 'badge@example.test', email_confirmed_at: '2026-01-01T00:00:00.000Z' } }, error: null }),
                        generateLink: async () => {
                            linkCalls += 1;
                            return { data: { properties: { hashed_token: 'token-hash' } }, error: null };
                        },
                    },
                },
            };
        },
    },
});

const { POST } = await import('../app/api/auth/barcode/route');

/** Creates a scanner request with an optional selected workspace. */
function request(tenantId?: string): Request {
    return new Request('https://kont.test/api/auth/barcode', {
        method: 'POST',
        headers: { Origin: 'https://kont.test', ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}) },
        body: JSON.stringify({ barcode: 'KONT-abcdefghijklmnopqrstuv' }),
    });
}

test('a locked badge session can re-enter only its registered organization', async () => {
    hasSessionCookie = true;
    badgeTenantId = 'organization-a';
    tenantResolution = new Error('barcode_session_locked');
    registeredScope = { registered: true, tenantId: 'organization-a' };
    linkCalls = 0;

    const response = await POST(request('organization-a'));

    assert.equal(response.status, 200);
    assert.equal(linkCalls, 1);
});

test('a locked badge session rejects a foreign badge before session issuance', async () => {
    hasSessionCookie = true;
    badgeTenantId = 'organization-b';
    tenantResolution = new Error('barcode_session_locked');
    registeredScope = { registered: true, tenantId: 'organization-a' };
    linkCalls = 0;

    const response = await POST(request('organization-a'));

    assert.equal(response.status, 401);
    assert.equal(linkCalls, 0);
});

test('a spoofed workspace selector cannot bypass the registered badge workspace', async () => {
    hasSessionCookie = true;
    badgeTenantId = 'organization-a';
    tenantResolution = new Error('barcode_session_locked');
    registeredScope = { registered: true, tenantId: 'organization-a' };
    linkCalls = 0;

    const response = await POST(request('organization-b'));

    assert.equal(response.status, 401);
    assert.equal(linkCalls, 0);
});

test('an anonymous browser can perform its first badge sign-in', async () => {
    hasSessionCookie = false;
    badgeTenantId = 'organization-a';
    tenantResolution = new Error('no_current_workspace');
    linkCalls = 0;

    const response = await POST(request());

    assert.equal(response.status, 200);
    assert.equal(linkCalls, 1);
});

test('an unverifiable existing session fails closed before session issuance', async () => {
    hasSessionCookie = true;
    badgeTenantId = 'organization-a';
    tenantResolution = new Error('authorization_unavailable');
    registeredScope = { registered: false };
    linkCalls = 0;

    const response = await POST(request('organization-a'));

    assert.equal(response.status, 401);
    assert.equal(linkCalls, 0);
});

test('an ordinary authenticated workspace may exchange a same-organization badge', async () => {
    hasSessionCookie = true;
    badgeTenantId = 'organization-a';
    tenantResolution = 'organization-a';
    linkCalls = 0;
    verifyOtpCalls = 0;
    signOutCalls = 0;

    const response = await POST(request('organization-a'));

    assert.equal(response.status, 200);
    assert.equal(linkCalls, 1);
    assert.equal(verifyOtpCalls, 1);
    assert.equal(signOutCalls, 0);
});

test('an ordinary authenticated workspace rejects a foreign badge without replacing cookies', async () => {
    hasSessionCookie = true;
    badgeTenantId = 'organization-b';
    tenantResolution = 'organization-a';
    linkCalls = 0;
    verifyOtpCalls = 0;
    signOutCalls = 0;

    const response = await POST(request('organization-a'));

    assert.equal(response.status, 401);
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal(linkCalls, 0);
    assert.equal(verifyOtpCalls, 0);
    assert.equal(signOutCalls, 0);
});
