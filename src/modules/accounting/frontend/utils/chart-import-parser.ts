// Client-side parser for plan de cuentas import files.
//
// Supported format (MEISTER-style CSV/TXT):
//   code,"  Account Name",G|M,level,...
//
//   - code        : account code, e.g. "1", "1.1", "1.1.01", "1.1.01.01.001"
//   - name        : quoted string with leading spaces (indentation)
//   - G|M         : G = group/summary, M = movement/detail (postable)
//   - level       : numeric depth 1–5
//
// Account type is inferred from the root segment of the code:
//   1.x → asset | 2.x → liability | 3.x → equity | 4.x → revenue | 5–9.x → expense

import type { ImportAccountInput } from '../../backend/domain/repository/chart.repository';

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

function inferType(code: string): AccountType {
    const root = code.split('.')[0];
    switch (root) {
        case '1': return 'asset';
        case '2': return 'liability';
        case '3': return 'equity';
        case '4': return 'revenue';
        default:  return 'expense';  // 5, 6, 7, 8, 9
    }
}

function deriveParentCode(code: string): string | null {
    const parts = code.split('.');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('.');
}

// Line regex: code,"name",G|M,level,...
const LINE_RE = /^([^,]+),"([^"]*)",([GM]),(\d)/;

function parseLine(line: string): ImportAccountInput | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const m = LINE_RE.exec(trimmed);
    if (!m) return null;

    const code    = m[1].trim();
    const name    = m[2].trim();
    const kind    = m[3]; // G or M
    if (!code || !name) return null;

    return {
        code,
        name,
        type:       inferType(code),
        parentCode: deriveParentCode(code),
        isGroup:    kind === 'G',
    };
}

export interface ParseResult {
    accounts: ImportAccountInput[];
    skipped:  number;
}

export function parseChartFile(content: string): ParseResult {
    const lines    = content.split(/\r?\n/);
    const accounts: ImportAccountInput[] = [];
    let skipped    = 0;

    for (const line of lines) {
        const acc = parseLine(line);
        if (acc) {
            accounts.push(acc);
        } else if (line.trim()) {
            skipped++;
        }
    }

    return { accounts, skipped };
}
