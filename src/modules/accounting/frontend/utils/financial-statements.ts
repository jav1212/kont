// Pure compute helpers for the formal financial statements.
//
// Inputs come from the existing trial balance (`TrialBalanceLine`), where
// `balance = totalDebit - totalCredit`. Account natural side:
//   asset, expense  → debit-normal (balance is positive when normal)
//   liability, equity, revenue → credit-normal (balance is negative when normal)
//
// To present each account with its natural sign, we flip credit-normal
// balances. The result is "presentation amount" — what the user expects to
// see (positive numbers when normal, negative numbers when an account has
// an unusual side).

import type { TrialBalanceLine } from '../../backend/domain/repository/journal-entry.repository';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StatementLine {
    accountId:   string;
    accountCode: string;
    accountName: string;
    /** Presented amount with natural sign (positive when normal). */
    amount:      number;
}

export interface BalanceSheet {
    /** Activos (asset accounts) */
    assets:      StatementLine[];
    totalAssets: number;
    /** Pasivos (liability accounts) */
    liabilities:      StatementLine[];
    totalLiabilities: number;
    /** Patrimonio (equity accounts) */
    equity:      StatementLine[];
    totalEquity: number;
    /** Utilidad / Pérdida del ejercicio = ingresos − gastos */
    netIncome:   number;
    /** Total Pasivos + Patrimonio + Utilidad del ejercicio */
    totalLiabilitiesAndEquity: number;
    /** totalAssets − totalLiabilitiesAndEquity (debe ser 0). */
    discrepancy: number;
}

export interface IncomeStatement {
    /** Ingresos (revenue accounts) */
    revenues:      StatementLine[];
    totalRevenues: number;
    /** Gastos (expense accounts) */
    expenses:      StatementLine[];
    totalExpenses: number;
    /** Utilidad o pérdida neta = ingresos − gastos */
    netIncome:     number;
}

export interface FinancialStatements {
    balanceSheet:    BalanceSheet;
    incomeStatement: IncomeStatement;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sortByCode(a: StatementLine, b: StatementLine): number {
    return a.accountCode.localeCompare(b.accountCode, 'es-VE');
}

function toLine(t: TrialBalanceLine, presentAmount: number): StatementLine {
    return {
        accountId:   t.accountId,
        accountCode: t.accountCode,
        accountName: t.accountName,
        amount:      presentAmount,
    };
}

// ── Main builder ─────────────────────────────────────────────────────────────

export function buildFinancialStatements(
    rows: TrialBalanceLine[],
): FinancialStatements {
    const assets: StatementLine[]      = [];
    const liabilities: StatementLine[] = [];
    const equity: StatementLine[]      = [];
    const revenues: StatementLine[]    = [];
    const expenses: StatementLine[]    = [];

    for (const r of rows) {
        const balance = r.balance ?? 0;
        switch (r.accountType) {
            case 'asset':     assets.push(toLine(r,  balance)); break;
            case 'expense':   expenses.push(toLine(r, balance)); break;
            case 'liability': liabilities.push(toLine(r, -balance)); break;
            case 'equity':    equity.push(toLine(r, -balance)); break;
            case 'revenue':   revenues.push(toLine(r, -balance)); break;
            default: break;
        }
    }

    assets.sort(sortByCode);
    liabilities.sort(sortByCode);
    equity.sort(sortByCode);
    revenues.sort(sortByCode);
    expenses.sort(sortByCode);

    const sum = (xs: StatementLine[]): number =>
        Math.round(xs.reduce((acc, x) => acc + x.amount, 0) * 100) / 100;

    const totalAssets      = sum(assets);
    const totalLiabilities = sum(liabilities);
    const totalEquity      = sum(equity);
    const totalRevenues    = sum(revenues);
    const totalExpenses    = sum(expenses);
    const netIncome        = Math.round((totalRevenues - totalExpenses) * 100) / 100;
    const totalLiabilitiesAndEquity =
        Math.round((totalLiabilities + totalEquity + netIncome) * 100) / 100;
    const discrepancy =
        Math.round((totalAssets - totalLiabilitiesAndEquity) * 100) / 100;

    return {
        balanceSheet: {
            assets,           totalAssets,
            liabilities,      totalLiabilities,
            equity,           totalEquity,
            netIncome,
            totalLiabilitiesAndEquity,
            discrepancy,
        },
        incomeStatement: {
            revenues,      totalRevenues,
            expenses,      totalExpenses,
            netIncome,
        },
    };
}
