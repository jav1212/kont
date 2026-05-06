#!/usr/bin/env node
// Audita app/api/**/route.ts y verifica que cada handler esté protegido por
// withTenant, requireAdmin, o esté en una allowlist explícita.
//
// Falla con exit 1 si encuentra una ruta sin proteger. Pensado para correr en CI.
//
// Reglas:
//   - app/api/auth/*       → allowlist (sign-in, sign-up, callback, me, etc.)
//   - app/api/bcv/*        → allowlist (datos externos públicos)
//   - app/api/status/*     → allowlist (datos externos públicos)
//   - app/api/cron/*       → allowlist (protegido por CRON_SECRET, no por user auth)
//   - app/api/admin/*      → requiere `requireAdmin(req)` al inicio del handler
//   - resto                → requiere export envuelto en `withTenant(...)`
//
// Reglas adicionales:
//   - Un handler protegido NO debe leer userId/ownerId/tenantId del body o
//     searchParams: el id viene del TenantContext o del JWT, nunca del cliente.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const API_DIR = join(ROOT, 'app', 'api');

const ALLOWLIST_PREFIXES = [
    'auth/',
    'bcv/',
    'status/',
    'cron/',
];

// Rutas individuales que están exentas de withTenant/requireAdmin por diseño.
// Cada entrada DEBE estar justificada en el comentario.
const ALLOWLIST_FILES = new Set([
    // Login/logout/recuperación del panel admin: sin auth previa por definición.
    'admin/sign-in/route.ts',
    'admin/sign-out/route.ts',
    'admin/forgot-password/route.ts',

    // Callback de email de invitación: el usuario invitado todavía no tiene
    // tenant context. Hace cookie auth check interno antes de aceptar.
    'memberships/accept/route.ts',

    // Lista de planes mostrada en /pricing público y en /settings/billing.
    // Datos no sensibles, intencionalmente público.
    'billing/plans/route.ts',
]);

const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) out.push(...walk(full));
        else if (name === 'route.ts' || name === 'route.tsx') out.push(full);
    }
    return out;
}

function relApi(file) {
    return relative(API_DIR, file).replaceAll(sep, '/');
}

function isAllowlisted(relPath) {
    return ALLOWLIST_PREFIXES.some(p => relPath.startsWith(p))
        || ALLOWLIST_FILES.has(relPath);
}

function callsRequireTenantInline(src) {
    // Patrón legítimo: handler clásico que llama `await requireTenant()` para
    // obtener userId pero no necesita tenant context (memberships/route.ts).
    return /\brequireTenant\s*\(/.test(src);
}

function isAdminRoute(relPath) {
    return relPath.startsWith('admin/');
}

function findExportedHandlers(src) {
    const found = [];
    for (const verb of HTTP_VERBS) {
        const reAsync = new RegExp(`export\\s+async\\s+function\\s+${verb}\\b`);
        const reConst = new RegExp(`export\\s+const\\s+${verb}\\s*=`);
        if (reAsync.test(src) || reConst.test(src)) found.push(verb);
    }
    return found;
}

function isWrappedInWithTenant(src, verb) {
    const re = new RegExp(`export\\s+const\\s+${verb}\\s*=\\s*withTenant\\s*\\(`);
    return re.test(src);
}

function callsRequireAdmin(src) {
    return /requireAdmin\s*\(/.test(src);
}

function hasSuspiciousIdRead(src) {
    const issues = [];
    const patterns = [
        // searchParams.get("userId" | "ownerId" | "tenantId" | "user_id" | "owner_id" | "tenant_id")
        /searchParams\.get\s*\(\s*["'](?:user_?id|owner_?id|tenant_?id)["']\s*\)/gi,
        // body destructuring: const { userId, ... } = await req.json();
        /(?:const|let|var)\s*\{[^}]*\b(?:userId|ownerId|tenantId|user_id|owner_id|tenant_id)\b[^}]*\}\s*=\s*await\s+req\.json/gi,
    ];
    for (const re of patterns) {
        const m = src.match(re);
        if (m) issues.push(...m);
    }
    return issues;
}

function audit() {
    const files = walk(API_DIR);
    const violations = [];

    for (const file of files) {
        const rel = relApi(file);
        const src = readFileSync(file, 'utf8');
        const handlers = findExportedHandlers(src);

        if (handlers.length === 0) {
            violations.push({ file: rel, level: 'warn', msg: 'no exported HTTP handler found' });
            continue;
        }

        const allow = isAllowlisted(rel);
        const admin = isAdminRoute(rel);

        for (const verb of handlers) {
            if (allow) continue;

            if (admin) {
                if (!callsRequireAdmin(src)) {
                    violations.push({
                        file: rel,
                        level: 'error',
                        msg: `${verb} in admin/ does not call requireAdmin()`,
                    });
                }
                continue;
            }

            const protectedByTenant = isWrappedInWithTenant(src, verb) || callsRequireTenantInline(src);
            const protectedByAdmin  = callsRequireAdmin(src);

            if (!protectedByTenant && !protectedByAdmin) {
                violations.push({
                    file: rel,
                    level: 'error',
                    msg: `${verb} is unprotected — must be wrapped in withTenant(), call requireTenant(), call requireAdmin(), or be allowlisted`,
                });
            }
        }

        if (!allow) {
            const suspicious = hasSuspiciousIdRead(src);
            for (const m of suspicious) {
                violations.push({
                    file: rel,
                    level: 'error',
                    msg: `reads user/owner/tenant id from client input — must come from TenantContext: ${m.trim().slice(0, 120)}`,
                });
            }
        }
    }

    return violations;
}

const violations = audit();

if (violations.length === 0) {
    console.log(`OK — audited ${walk(API_DIR).length} route files, no violations.`);
    process.exit(0);
}

const errors = violations.filter(v => v.level === 'error');
const warns  = violations.filter(v => v.level === 'warn');

console.log(`Found ${errors.length} error(s), ${warns.length} warning(s):\n`);
for (const v of violations) {
    const tag = v.level === 'error' ? 'ERROR' : 'WARN ';
    console.log(`  ${tag}  ${v.file}: ${v.msg}`);
}

process.exit(errors.length > 0 ? 1 : 0);
