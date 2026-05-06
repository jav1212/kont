#!/usr/bin/env node
// Migra los handlers app/api/**/route.ts que usan el patrón legado
// `actingAs?.ownerId ?? userId` al campo nuevo `effectiveOwnerId` del
// TenantContext. Se aplican dos reemplazos por archivo:
//   1. `actingAs?.ownerId ?? userId`  →  `effectiveOwnerId`
//   2. destructuring del segundo argumento de withTenant gana
//      `effectiveOwnerId` si todavía no lo tiene.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const API_DIR = join(ROOT, 'app', 'api');

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

const PATTERN_INLINE = /actingAs\?\.ownerId\s*\?\?\s*userId/g;

// Inserta `effectiveOwnerId` en la destructuring del segundo arg de withTenant
// si el archivo va a usarlo y todavía no lo tiene.
function ensureDestructuringHasField(src, field) {
    if (!src.includes(field)) return src;

    return src.replace(
        /withTenant\s*\(\s*async\s*\(\s*[^,]+,\s*\{([^}]*)\}\s*\)/g,
        (full, inner) => {
            // Skip si ya está
            if (new RegExp(`\\b${field}\\b`).test(inner)) return full;
            const trimmed = inner.trim();
            const newInner = trimmed.length === 0
                ? ` ${field} `
                : `${inner.replace(/\s*$/, '')}, ${field}${/\s$/.test(inner) ? '' : ' '}`;
            return full.replace(`{${inner}}`, `{${newInner}}`);
        },
    );
}

let modified = 0;
const skipped = [];

for (const file of walk(API_DIR)) {
    const original = readFileSync(file, 'utf8');
    if (!PATTERN_INLINE.test(original)) continue;
    PATTERN_INLINE.lastIndex = 0;

    let next = original.replace(PATTERN_INLINE, 'effectiveOwnerId');
    next = ensureDestructuringHasField(next, 'effectiveOwnerId');

    if (next === original) {
        skipped.push(file);
        continue;
    }

    writeFileSync(file, next, 'utf8');
    modified++;
}

console.log(`Modified ${modified} files`);
if (skipped.length) {
    console.log(`Skipped (no change applied) ${skipped.length}:`);
    skipped.forEach(f => console.log('  ' + f));
}
