import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { isBarcodeSessionActive } from './application/barcode-session-policy';

export const BARCODE_TERMINAL_COOKIE = 'kont_barcode_terminal';
const BARCODE_SESSION_MAX_SECONDS = 8 * 60 * 60;

type TerminalRow = { id: string; tenant_id: string; name: string; status: string; protection_ready: boolean; created_at: string; last_used_at: string | null; revoked_at: string | null };
type BadgeRow = { id: string; tenant_id: string; user_id: string; status: string; created_at: string; revoked_at: string | null; code_ciphertext?: string | null };

export type BarcodeTerminal = { id: string; name: string; status: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };
export type BarcodeBadge = { id: string; userId: string; email: string | null; status: string; createdAt: string; revokedAt: string | null; reprintable: boolean };
export type BarcodeSessionValidation = { registered: boolean; active: boolean; id?: string; tenantId?: string; terminalId?: string; expiresAt?: string; idleExpiresAt?: string };
export type BarcodeTerminalResolution =
    | { ready: true; terminal: TerminalRow }
    | { ready: false; reason: 'not_enrolled' | 'revoked' | 'access_unavailable' };

const BADGE_CIPHER_VERSION = 'v1';

/** Decodes the server-only AES-256 key used to permit future badge reprints. */
function badgeEncryptionKey(): Buffer {
    const value = process.env.KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY;
    if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('badge_reprint_unavailable');
    const key = Buffer.from(value, 'base64url');
    if (key.length !== 32) throw new Error('badge_reprint_unavailable');
    return key;
}

/** Binds ciphertext to the badge identity and immutable login verifier. */
function badgeCipherAad(tenantId: string, userId: string, hash: string): Buffer {
    return Buffer.from(`${tenantId}:${userId}:${hash}`, 'utf8');
}

/**
 * Encrypts a newly issued badge value for server-side reprint only.
 * @param input - Tenant-bound badge identity and raw printable credential.
 * @returns A versioned authenticated ciphertext safe for service-role storage.
 * @throws Error when the server encryption key is unavailable or invalid.
 */
export function encryptBarcodeBadge(input: { tenantId: string; userId: string; barcode: string }): string {
    const hash = credentialHash(input.barcode);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', badgeEncryptionKey(), nonce);
    cipher.setAAD(badgeCipherAad(input.tenantId, input.userId, hash));
    const ciphertext = Buffer.concat([cipher.update(input.barcode, 'utf8'), cipher.final()]);
    return `${BADGE_CIPHER_VERSION}.${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

/**
 * Decrypts a stored badge value and verifies it still matches its lookup hash.
 * @param input - Stored encrypted credential and immutable tenant/user/hash bindings.
 * @returns The validated raw printable credential.
 * @throws Error when the ciphertext, key, binding, or credential is invalid.
 */
export function decryptBarcodeBadge(input: { tenantId: string; userId: string; codeHash: string; ciphertext: string }): string {
    try {
        const [version, nonce, tag, ciphertext] = input.ciphertext.split('.');
        if (version !== BADGE_CIPHER_VERSION || !nonce || !tag || !ciphertext || input.ciphertext.split('.').length !== 4) throw new Error();
        const decipher = createDecipheriv('aes-256-gcm', badgeEncryptionKey(), Buffer.from(nonce, 'base64url'));
        decipher.setAAD(badgeCipherAad(input.tenantId, input.userId, input.codeHash));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        const barcode = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
        const actualHash = Buffer.from(credentialHash(barcode), 'utf8');
        const expectedHash = Buffer.from(input.codeHash, 'utf8');
        if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash) || !/^KONT-[A-Za-z0-9_-]{20,25}$/.test(barcode)) throw new Error();
        return barcode;
    } catch {
        throw new Error('badge_reprint_unavailable');
    }
}

/**
 * Creates a fixed-length SHA-256 digest for a high-entropy server credential.
 *
 * @param value - Raw terminal secret or badge value, never persisted or logged.
 * @returns Lowercase hexadecimal digest used only for equality queries.
 */
function credentialHash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Produces a scanner-safe Code 128 credential with 128 bits of entropy.
 *
 * @returns An ASCII Code 128 payload prefixed with the reserved KONT marker.
 */
function barcodeValue(): string {
    return `KONT-${randomBytes(16).toString('base64url')}`;
}

/**
 * Produces a terminal secret that is distinct from printable badge credentials.
 *
 * @returns An opaque random terminal credential.
 */
function terminalSecret(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * Maps a database terminal into the HTTP-safe terminal shape.
 *
 * @param terminal - Internal terminal row.
 * @returns Terminal metadata without its credential digest.
 */
function terminalDto(terminal: TerminalRow): BarcodeTerminal {
    return { id: terminal.id, name: terminal.name, status: terminal.status, createdAt: terminal.created_at, lastUsedAt: terminal.last_used_at, revokedAt: terminal.revoked_at };
}

/**
 * Validates the origin for cookie-authenticated mutations.
 *
 * @param request - HTTP request that must originate from this application.
 * @returns Whether the Origin header matches the request origin.
 */
export function hasSameOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    return !!origin && origin === new URL(request.url).origin;
}

/**
 * Confirms that the database-level direct-access guard is installed and enabled.
 *
 * @returns True only after the follow-up protection migration reports readiness.
 */
export async function isBarcodeAccessProtectionReady(): Promise<boolean> {
    if (process.env.KONTAVE_BARCODE_ACCESS_ENABLED !== 'true') return false;
    const { data, error } = await new ServerSupabaseSource().instance.rpc('barcode_access_protection_ready');
    return !error && data === true;
}

/**
 * Applies authentication throttling and denies production access during limiter outages.
 * @param request - Incoming request used for the independent IP quota.
 * @param options - Server-selected bucket, quota and optional terminal identity.
 * @returns A 429/503 response when denied, otherwise null.
 */
export async function barcodeRateLimit(request: Request, options: { bucket: string; limit: number; windowSec: number; keyExtra?: string }): Promise<Response | null> {
    if (process.env.NODE_ENV === 'production' && (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)) {
        return Response.json({ error: 'El acceso no está disponible temporalmente.', code: 'rate_limit_unavailable' }, { status: 503 });
    }
    const { rateLimit } = await import('@/src/shared/backend/utils/rate-limit');
    return rateLimit(request, {
        ...options,
        failureMode: process.env.NODE_ENV === 'production' ? 'deny' : 'allow',
        ...(options.bucket === 'barcode-login-terminal' ? { identityKey: options.keyExtra } : {}),
    });
}

/**
 * Decodes the Supabase session UUID claim without trusting it as authentication.
 * The token has already been minted by Supabase; the UUID is only used as an
 * index into the server-side barcode session registry.
 *
 * @param accessToken - Supabase access token returned by verifyOtp.
 * @returns The session UUID claim, or null when the token is malformed.
 */
export function sessionIdFromAccessToken(accessToken: string): string | null {
    try {
        const part = accessToken.split('.')[1];
        if (!part) return null;
        const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { session_id?: unknown };
        return typeof payload.session_id === 'string' && /^[0-9a-f-]{36}$/i.test(payload.session_id) ? payload.session_id : null;
    } catch {
        return null;
    }
}

/**
 * Tests whether a user is currently authorized in a legacy Web tenant.
 * Owners are represented by the tenant ID; members require an accepted, active row.
 *
 * @param tenantId - Tenant whose membership is required.
 * @param userId - User to validate.
 * @returns True when the user is the owner or an active accepted member.
 */
async function hasTenantMembership(tenantId: string, userId: string): Promise<boolean> {
    if (tenantId === userId) return true;
    const source = new ServerSupabaseSource().instance;
    const { data, error } = await source.from('tenant_memberships').select('id').eq('tenant_id', tenantId).eq('member_id', userId).not('accepted_at', 'is', null).is('revoked_at', null).maybeSingle();
    if (error) throw new Error('barcode_membership_lookup_failed');
    return !!data;
}

/**
 * Writes security audit data without allowing an audit outage to expose credentials.
 *
 * @param values - Sanitized event metadata; raw credentials are intentionally absent.
 * @returns Resolves after the best-effort insert completes.
 */
async function audit(values: Record<string, unknown>): Promise<void> {
    try { await new ServerSupabaseSource().instance.from('barcode_access_audit').insert(values); } catch { /* audit availability must not disclose credential state */ }
}

/**
 * Records a rejected scan without retaining the scanned credential or provider data.
 * @param terminal - Server-resolved terminal scope, when enrollment was valid.
 * @returns Resolves after attempting to record the generic denial.
 */
export async function recordBarcodeLoginDenial(terminal?: { id: string; tenant_id: string }): Promise<void> {
    await audit({ event: 'login_denied', reason: 'credential_denied', tenant_id: terminal?.tenant_id, terminal_id: terminal?.id });
}

/**
 * Validates an active barcode session for middleware and route guards.
 *
 * @param userId - Authenticated Supabase user identifier.
 * @param supabaseSessionId - Session UUID claim from the verified Supabase JWT.
 * @param terminalCookie - Browser enrollment credential, required for active access.
 * @returns Active tenant and terminal scope only when all revocation checks pass.
 * @throws Error when the registry or an authorization dependency cannot be read.
 */
export async function validateBarcodeAccessSession(userId: string, supabaseSessionId: string, terminalCookie?: string): Promise<BarcodeSessionValidation> {
    const source = new ServerSupabaseSource().instance;
    const { data, error } = await source.from('barcode_access_sessions').select('id,tenant_id,terminal_id,expires_at,last_activity_at,badge_id,status').eq('supabase_session_id', supabaseSessionId).eq('user_id', userId).maybeSingle();
    if (error) throw new Error('barcode_session_lookup_failed');
    if (!data) return { registered: false, active: false };
    if (data.status !== 'active' || new Date(data.expires_at).getTime() <= Date.now() || new Date(data.last_activity_at).getTime() + 5 * 60 * 1000 <= Date.now()) return { registered: true, active: false, id: data.id };
    const [terminal, badge, membership, tenant] = await Promise.all([
        source.from('barcode_access_terminals').select('status,protection_ready').eq('id', data.terminal_id).maybeSingle(),
        source.from('barcode_access_badges').select('status').eq('id', data.badge_id).maybeSingle(),
        hasTenantMembership(data.tenant_id, userId),
        source.from('tenants').select('status').eq('id', data.tenant_id).maybeSingle(),
    ]);
    if (terminal.error || badge.error || tenant.error) throw new Error('barcode_session_dependency_lookup_failed');
    const cookieTerminal = terminalCookie ? await terminalFromCookie(terminalCookie) : null;
    if (!isBarcodeSessionActive({ status: data.status, expiresAt: data.expires_at, lastActivityAt: data.last_activity_at, terminalStatus: terminal.data?.status ?? null, terminalReady: !!terminal.data?.protection_ready, badgeStatus: badge.data?.status ?? null, membershipActive: membership, tenantStatus: tenant.data?.status ?? null, cookieTerminalId: cookieTerminal?.id ?? null, registeredTerminalId: data.terminal_id, now: Date.now() })) return { registered: true, active: false, id: data.id };
    return { registered: true, active: true, id: data.id, tenantId: data.tenant_id, terminalId: data.terminal_id, expiresAt: data.expires_at, idleExpiresAt: new Date(new Date(data.last_activity_at).getTime() + 5 * 60 * 1000).toISOString() };
}

/**
 * Checks whether a terminal cookie identifies an active, protected terminal.
 *
 * @param cookieValue - Cookie value in `terminalId.secret` form.
 * @returns The scoped terminal, or null for invalid/revoked/unprotected cookies.
 */
export async function terminalFromCookie(cookieValue: string | undefined): Promise<TerminalRow | null> {
    const resolution = await resolveBarcodeTerminal(cookieValue);
    return resolution.ready ? resolution.terminal : null;
}

/**
 * Resolves browser enrollment independently of the operator's login cookies.
 *
 * @param cookieValue - HttpOnly terminal credential supplied by the browser.
 * @returns A verified terminal or a safe reason; infrastructure failures never grant access.
 */
export async function resolveBarcodeTerminal(cookieValue: string | undefined): Promise<BarcodeTerminalResolution> {
    const separator = cookieValue?.indexOf('.');
    if (!cookieValue || separator === undefined || separator <= 0) return { ready: false, reason: 'not_enrolled' };
    const id = cookieValue.slice(0, separator);
    const secret = cookieValue.slice(separator + 1);
    if (!/^[0-9a-f-]{36}$/i.test(id) || secret.length < 40) return { ready: false, reason: 'not_enrolled' };
    try {
        if (!(await isBarcodeAccessProtectionReady())) return { ready: false, reason: 'access_unavailable' };
        const { data, error } = await new ServerSupabaseSource().instance.from('barcode_access_terminals').select('id,tenant_id,name,status,protection_ready,created_at,last_used_at,revoked_at').eq('id', id).eq('secret_hash', credentialHash(secret)).maybeSingle();
        if (error) return { ready: false, reason: 'access_unavailable' };
        if (!data) return { ready: false, reason: 'not_enrolled' };
        if (data.status !== 'active') return { ready: false, reason: 'revoked' };
        if (!data.protection_ready) return { ready: false, reason: 'access_unavailable' };
        return { ready: true, terminal: data as TerminalRow };
    } catch {
        return { ready: false, reason: 'access_unavailable' };
    }
}

/**
 * Lists terminal metadata for an administrator's active tenant.
 *
 * @param tenantId - Authorized tenant identifier.
 * @returns Terminal metadata without credentials.
 */
export async function listBarcodeTerminals(tenantId: string): Promise<BarcodeTerminal[]> {
    const { data, error } = await new ServerSupabaseSource().instance.from('barcode_access_terminals').select('id,tenant_id,name,status,protection_ready,created_at,last_used_at,revoked_at').eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (error) throw new Error('terminal_list_failed');
    return ((data ?? []) as TerminalRow[]).map(terminalDto);
}

/**
 * Enrolls the caller's browser profile as a new terminal.
 *
 * @param input - Authorized tenant, administrator, and display name.
 * @returns Terminal metadata plus the cookie value that must be HttpOnly.
 * @throws Error when persistence cannot create the terminal.
 */
export async function enrollBarcodeTerminal(input: { tenantId: string; actorId: string; name: string }): Promise<{ terminal: BarcodeTerminal; cookieValue: string }> {
    const secret = terminalSecret();
    const source = new ServerSupabaseSource().instance;
    const { data, error } = await source.from('barcode_access_terminals').insert({ tenant_id: input.tenantId, name: input.name.trim(), secret_hash: credentialHash(secret), protection_ready: true, enrolled_by: input.actorId }).select('id,tenant_id,name,status,protection_ready,created_at,last_used_at,revoked_at').single();
    if (error || !data) throw new Error('terminal_create_failed');
    await audit({ tenant_id: input.tenantId, terminal_id: data.id, user_id: input.actorId, event: 'terminal_enrolled' });
    return { terminal: terminalDto(data as TerminalRow), cookieValue: `${data.id}.${secret}` };
}

/**
 * Revokes a terminal and every session registered through it.
 *
 * @param input - Tenant-scoped terminal identifier and authorized actor.
 * @returns Whether a terminal belonging to the tenant was revoked.
 */
export async function revokeBarcodeTerminal(input: { tenantId: string; terminalId: string; actorId: string }): Promise<boolean> {
    const source = new ServerSupabaseSource().instance;
    const { data, error } = await source.from('barcode_access_terminals').update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: input.actorId }).eq('id', input.terminalId).eq('tenant_id', input.tenantId).eq('status', 'active').select('id').maybeSingle();
    if (error) throw new Error('barcode_terminal_revoke_failed');
    if (!data) return false;
    await source.from('barcode_access_sessions').update({ status: 'revoked', revoked_at: new Date().toISOString(), revocation_reason: 'terminal_revoked' }).eq('terminal_id', input.terminalId).eq('status', 'active');
    await audit({ tenant_id: input.tenantId, terminal_id: input.terminalId, user_id: input.actorId, event: 'terminal_revoked' });
    return true;
}

/**
 * Lists badges with the email needed by administrators to identify their holder.
 *
 * @param tenantId - Authorized tenant identifier.
 * @returns Sanitized badge list with no credential material.
 */
export async function listBarcodeBadges(tenantId: string): Promise<BarcodeBadge[]> {
    const source = new ServerSupabaseSource().instance;
    const { data, error } = await source.from('barcode_access_badges').select('id,tenant_id,user_id,status,created_at,revoked_at,code_ciphertext').eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (error) throw new Error('badge_list_failed');
    const rows = (data ?? []) as BadgeRow[];
    const users = await Promise.all(rows.map(async (badge) => ({ badge, response: await source.auth.admin.getUserById(badge.user_id) })));
    return users.map(({ badge, response }) => ({ id: badge.id, userId: badge.user_id, email: response.data.user?.email ?? null, status: badge.status, createdAt: badge.created_at, revokedAt: badge.revoked_at, reprintable: !!badge.code_ciphertext }));
}

/**
 * Issues a replacement badge after proving the holder is an eligible Web user.
 * Platform administrators, unconfirmed accounts, MFA accounts, and non-members are rejected.
 *
 * @param input - Tenant, target user, and administrator that authorized issuance.
 * @returns The initial-only printable barcode and public badge metadata.
 * @throws Error with a stable internal code for expected eligibility failures.
 */
export async function issueBarcodeBadge(input: { tenantId: string; userId: string; actorId: string }): Promise<{ badge: BarcodeBadge; barcode: string }> {
    if (!(await hasTenantMembership(input.tenantId, input.userId))) throw new Error('badge_user_not_member');
    const source = new ServerSupabaseSource().instance;
    const [{ data: admin, error: adminError }, { data: userData, error: userError }] = await Promise.all([
        source.from('admin_users').select('id').eq('id', input.userId).maybeSingle(),
        source.auth.admin.getUserById(input.userId),
    ]);
    const user = userData.user;
    if (adminError || userError || !user || !user.email_confirmed_at || (user.banned_until && Date.parse(user.banned_until) > Date.now()) || user.deleted_at || admin || user.factors?.some((factor) => factor.status === 'verified')) throw new Error('badge_user_ineligible');
    const barcode = barcodeValue();
    const codeHash = credentialHash(barcode);
    const ciphertext = encryptBarcodeBadge({ tenantId: input.tenantId, userId: input.userId, barcode });
    const { data, error } = await source.rpc('barcode_access_issue_badge', { p_tenant_id: input.tenantId, p_user_id: input.userId, p_actor_id: input.actorId, p_code_hash: codeHash, p_code_ciphertext: ciphertext });
    if (error || !data) throw new Error('badge_issue_failed');
    await audit({ tenant_id: input.tenantId, badge_id: data.id, user_id: input.userId, event: 'badge_issued' });
    return { badge: { id: data.id, userId: data.user_id, email: user.email ?? null, status: data.status, createdAt: data.created_at, revokedAt: data.revoked_at, reprintable: true }, barcode };
}

/**
 * Reprints one active tenant badge without replacing its credential.
 * @param input - Authorized tenant scope and target badge identifier.
 * @returns The active badge metadata and its restored printable credential.
 * @throws Error when the badge cannot safely be reprinted.
 */
export async function reprintBarcodeBadge(input: { tenantId: string; badgeId: string; actorId: string }): Promise<{ badge: BarcodeBadge; barcode: string }> {
    const source = new ServerSupabaseSource().instance;
    const { data, error } = await source.from('barcode_access_badges').select('id,tenant_id,user_id,status,created_at,revoked_at,code_hash,code_ciphertext').eq('id', input.badgeId).eq('tenant_id', input.tenantId).maybeSingle();
    if (error || !data || data.status !== 'active' || !(await hasTenantMembership(input.tenantId, data.user_id))) throw new Error('badge_reprint_unavailable');
    if (!data.code_ciphertext) throw new Error('badge_reprint_legacy');
    const [{ data: admin, error: adminError }, user] = await Promise.all([
        source.from('admin_users').select('id').eq('id', data.user_id).maybeSingle(),
        source.auth.admin.getUserById(data.user_id),
    ]);
    if (adminError || admin || user.error || !user.data.user?.email || !user.data.user.email_confirmed_at || (user.data.user.banned_until && Date.parse(user.data.user.banned_until) > Date.now()) || user.data.user.deleted_at || user.data.user.factors?.some((factor) => factor.status === 'verified')) throw new Error('badge_reprint_unavailable');
    const barcode = decryptBarcodeBadge({ tenantId: input.tenantId, userId: data.user_id, codeHash: data.code_hash, ciphertext: data.code_ciphertext });
    await audit({ tenant_id: input.tenantId, badge_id: data.id, user_id: input.actorId, event: 'badge_reprinted' });
    return { badge: { id: data.id, userId: data.user_id, email: user.data.user.email, status: data.status, createdAt: data.created_at, revokedAt: data.revoked_at, reprintable: true }, barcode };
}

/**
 * Reprints every active badge in a tenant, failing rather than omitting legacy cards.
 * @param input - Authorized tenant scope and administrator identity for audit.
 * @returns All active printable badges after validating every entry first.
 * @throws Error when any active badge cannot safely be reprinted.
 */
export async function reprintAllBarcodeBadges(input: { tenantId: string; actorId: string }): Promise<Array<{ badge: BarcodeBadge; barcode: string }>> {
    const source = new ServerSupabaseSource().instance;
    const badges: Array<{ id: string; code_ciphertext: string | null }> = [];
    for (let start = 0; ; start += 500) {
        const { data, error } = await source.from('barcode_access_badges').select('id,code_ciphertext').eq('tenant_id', input.tenantId).eq('status', 'active').order('created_at', { ascending: true }).order('id', { ascending: true }).range(start, start + 499);
        if (error) throw new Error('badge_reprint_unavailable');
        const page = (data ?? []) as Array<{ id: string; code_ciphertext: string | null }>;
        badges.push(...page);
        if (page.length < 500) break;
    }
    if (badges.some((badge) => !badge.id || !badge.code_ciphertext)) throw new Error('badge_reprint_legacy');
    const printed: Array<{ badge: BarcodeBadge; barcode: string }> = [];
    for (let start = 0; start < badges.length; start += 10) {
        printed.push(...await Promise.all(badges.slice(start, start + 10).map((badge) => reprintBarcodeBadge({ tenantId: input.tenantId, badgeId: badge.id, actorId: input.actorId }))));
    }
    await audit({ tenant_id: input.tenantId, user_id: input.actorId, event: 'badges_exported', reason: `count:${printed.length}` });
    return printed;
}

/**
 * Revokes a badge and its live barcode sessions.
 *
 * @param input - Tenant-scoped badge identifier and authorized actor.
 * @returns Whether an active badge was revoked.
 */
export async function revokeBarcodeBadge(input: { tenantId: string; badgeId: string; actorId: string }): Promise<boolean> {
    const source = new ServerSupabaseSource().instance;
    const { data, error } = await source.from('barcode_access_badges').update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: input.actorId }).eq('id', input.badgeId).eq('tenant_id', input.tenantId).eq('status', 'active').select('id,user_id').maybeSingle();
    if (error) throw new Error('barcode_badge_revoke_failed');
    if (!data) return false;
    await source.from('barcode_access_sessions').update({ status: 'revoked', revoked_at: new Date().toISOString(), revocation_reason: 'badge_revoked' }).eq('badge_id', input.badgeId).eq('status', 'active');
    await audit({ tenant_id: input.tenantId, badge_id: input.badgeId, user_id: input.actorId, event: 'badge_revoked' });
    return true;
}

/**
 * Resolves a valid badge for a protected terminal without returning its code.
 *
 * @param terminal - Validated terminal scope.
 * @param barcode - Scanner-provided credential.
 * @returns Badge and user IDs when login may proceed, otherwise null.
 */
export async function findLoginBadge(terminal: TerminalRow, barcode: string): Promise<{ id: string; userId: string } | null> {
    if (!/^KONT-[A-Za-z0-9_-]{20,25}$/.test(barcode)) return null;
    const source = new ServerSupabaseSource().instance;
    const { data } = await source.from('barcode_access_badges').select('id,user_id,tenant_id,status').eq('tenant_id', terminal.tenant_id).eq('code_hash', credentialHash(barcode)).maybeSingle();
    if (!data || data.status !== 'active' || !(await hasTenantMembership(terminal.tenant_id, data.user_id))) return null;
    return { id: data.id, userId: data.user_id };
}

/**
 * Registers a newly minted Supabase session under barcode access controls.
 *
 * @param input - Validated badge, terminal, Supabase session ID, and expiry.
 * @returns The barcode session metadata.
 * @throws Error when the registration cannot be committed.
 */
export async function registerBarcodeSession(input: { supabaseSessionId: string; userId: string; tenantId: string; terminalId: string; badgeId: string; expiresAt: string }): Promise<{ id: string; expiresAt: string }> {
    const source = new ServerSupabaseSource().instance;
    const { data, error } = await source.rpc('barcode_access_register_session', { p_supabase_session_id: input.supabaseSessionId, p_user_id: input.userId, p_tenant_id: input.tenantId, p_terminal_id: input.terminalId, p_badge_id: input.badgeId, p_expires_at: input.expiresAt });
    if (error || !data) throw new Error('session_register_failed');
    await audit({ tenant_id: input.tenantId, terminal_id: input.terminalId, badge_id: input.badgeId, user_id: input.userId, event: 'login_allowed' });
    return { id: data.id, expiresAt: data.expires_at };
}

/**
 * Marks a barcode session locked. Repeating the request is intentionally safe.
 *
 * @param supabaseSessionId - Session claim to lock.
 * @param userId - Authenticated user who owns the session.
 * @param expectedSessionId - Registry ID observed by the requesting tab.
 * @returns Whether a live session was transitioned to locked.
 * @throws Error when persistence cannot confirm the lock.
 */
export async function lockBarcodeSession(supabaseSessionId: string, userId: string, expectedSessionId?: string): Promise<boolean> {
    const source = new ServerSupabaseSource().instance;
    if (!expectedSessionId) return false;
    const { data, error } = await source.from('barcode_access_sessions').update({ status: 'locked', revoked_at: new Date().toISOString(), revocation_reason: 'user_locked' }).eq('supabase_session_id', supabaseSessionId).eq('user_id', userId).eq('id', expectedSessionId).eq('status', 'active').select('id,tenant_id,terminal_id,badge_id').maybeSingle();
    if (error) throw new Error('barcode_session_lock_failed');
    if (data) await audit({ tenant_id: data.tenant_id, terminal_id: data.terminal_id, badge_id: data.badge_id, user_id: userId, event: 'session_locked' });
    return !!data;
}

/**
 * Records a real UI activity event after binding it to the active registry session.
 *
 * @param supabaseSessionId - Verified Supabase session claim.
 * @param userId - Session owner.
 * @param expectedSessionId - Registry ID seen by the active browser tab.
 * @returns True when activity was accepted for the current session.
 */
export async function touchBarcodeSession(supabaseSessionId: string, userId: string, expectedSessionId: string): Promise<boolean> {
    const source = new ServerSupabaseSource().instance;
    const { data, error } = await source.from('barcode_access_sessions').update({ last_activity_at: new Date().toISOString() }).eq('supabase_session_id', supabaseSessionId).eq('user_id', userId).eq('id', expectedSessionId).eq('status', 'active').gt('expires_at', new Date().toISOString()).gt('last_activity_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()).select('id').maybeSingle();
    if (error) throw new Error('barcode_session_touch_failed');
    return !!data;
}

/**
 * Supplies the absolute maximum lifetime for a carnet session, independent of JWT refresh.
 * @returns The lifetime limit in seconds.
 */
export function barcodeSessionMaxSeconds(): number { return BARCODE_SESSION_MAX_SECONDS; }
