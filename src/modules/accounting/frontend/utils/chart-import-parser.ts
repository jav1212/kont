// Client-side parser for plan de cuentas import files.
//
// Supported formats:
//   MEISTER TXT export (9 cols): code,"name",G|M,level,NO,NO,NO,M,O|C|I
//   Custom (5 cols):              code,"name",G|M,level,D|H
//
// The naturaleza (Debe/Haber) is NOT stored in the MEISTER TXT — it is always
// derived from the account code root.  We expose detectRoots() so the UI can
// let the user confirm or override the pre-filled naturaleza before importing.

import type { ImportAccountInput } from '../../backend/domain/repository/chart.repository';

// ── Types ──────────────────────────────────────────────────────────────────────

export type Naturaleza = 'debe' | 'haber';

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

/** One root-code group with its detected naturaleza and account count. */
export interface RootEntry {
    root:       string;     // e.g. "1", "2", "5"
    naturaleza: Naturaleza; // pre-filled from standard convention
    count:      number;     // total accounts (groups + movements) under this root
    sample:     string;     // first account name — gives the user context
}

export interface ParseResult {
    accounts: ImportAccountInput[];
    skipped:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Standard Venezuelan chart convention: 1=Activo, 2=Pasivo, 3=Patrimonio,
// 4=Ingresos, 5-9=Costos/Gastos.  Used ONLY as a default — the user can override.
function inferType(code: string): AccountType {
    const root = code.split('.')[0];
    switch (root) {
        case '1': return 'asset';
        case '2': return 'liability';
        case '3': return 'equity';
        case '4': return 'revenue';
        default:  return 'expense';
    }
}

function naturalezaOf(type: AccountType): Naturaleza {
    return type === 'asset' || type === 'expense' ? 'debe' : 'haber';
}

// Apply a user-supplied naturaleza override while preserving the most specific
// type possible (e.g. "expense" is kept instead of collapsed to "asset" when the
// user confirms "debe" for root 5).
function applyNaturaleza(inferred: AccountType, override: Naturaleza): AccountType {
    if (override === 'debe') {
        return inferred === 'asset' || inferred === 'expense' ? inferred : 'asset';
    }
    return inferred === 'liability' || inferred === 'equity' || inferred === 'revenue'
        ? inferred
        : 'liability';
}

function deriveParentCode(code: string): string | null {
    const parts = code.split('.');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('.');
}

// Matches: code,"name",G|M,level[,anything...]
// The 5th column is intentionally ignored for MEISTER files (NO/SI flags).
// The naturaleza is resolved via the naturalezaMap instead.
const LINE_RE = /^([^,]+),"([^"]*)",([GM]),(\d)/;

function parseLine(
    line: string,
    naturalezaMap: Record<string, Naturaleza>,
): ImportAccountInput | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const m = LINE_RE.exec(trimmed);
    if (!m) return null;

    const code = m[1].trim();
    const name = m[2].trim();
    const kind = m[3];
    if (!code || !name) return null;

    const root     = code.split('.')[0] ?? code;
    const inferred = inferType(code);
    const override = naturalezaMap[root];
    const type     = override !== undefined ? applyNaturaleza(inferred, override) : inferred;

    return {
        code,
        name,
        type,
        parentCode: deriveParentCode(code),
        isGroup:    kind === 'G',
    };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scans the file and returns one entry per unique root code, pre-filled with
 * the standard Venezuelan naturaleza.  The UI presents this list so the user
 * can confirm or adjust before the actual import.
 */
export function detectRoots(content: string): RootEntry[] {
    const lines = content.split(/\r?\n/);
    const map   = new Map<string, { naturaleza: Naturaleza; count: number; sample: string }>();

    for (const line of lines) {
        const acc = parseLine(line, {});
        if (!acc) continue;

        const root = acc.code.split('.')[0] ?? acc.code;
        const nat  = naturalezaOf(inferType(acc.code));

        if (!map.has(root)) {
            map.set(root, { naturaleza: nat, count: 0, sample: acc.name });
        }
        map.get(root)!.count++;
    }

    return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([root, data]) => ({ root, ...data }));
}

/**
 * Parses the file into ImportAccountInput records, applying the naturalezaMap
 * that the user confirmed in the UI.  Lines that do not match the expected
 * format are counted as skipped.
 */
export function parseChartFile(
    content: string,
    naturalezaMap: Record<string, Naturaleza> = {},
): ParseResult {
    const lines    = content.split(/\r?\n/);
    const accounts: ImportAccountInput[] = [];
    let   skipped  = 0;

    for (const line of lines) {
        const acc = parseLine(line, naturalezaMap);
        if (acc) {
            accounts.push(acc);
        } else if (line.trim()) {
            skipped++;
        }
    }

    return { accounts, skipped };
}
