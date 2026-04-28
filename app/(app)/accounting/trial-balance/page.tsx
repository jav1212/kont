"use client";

// Trial balance (Balance de Comprobación) page.
// Aggregates posted entry lines per account and displays debit/credit/balance columns.
// Uses the useTrialBalance hook — no raw fetch() in this component.
import { useId, useState }            from 'react';
import { PageHeader }                 from '@/src/shared/frontend/components/page-header';
import { BaseTable }                  from '@/src/shared/frontend/components/base-table';
import { AccountingAccessGuard }      from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                 from '@/src/modules/companies/frontend/hooks/use-companies';
import { useAccountingPeriods }       from '@/src/modules/accounting/frontend/hooks/use-accounting-periods';
import { useTrialBalance }            from '@/src/modules/accounting/frontend/hooks/use-trial-balance';
import type { TrialBalanceLine }      from '@/src/modules/accounting/backend/domain/repository/journal-entry.repository';
import { APP_SIZES }                  from '@/src/shared/frontend/sizes';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    asset:     'Activo',
    liability: 'Pasivo',
    equity:    'Patrimonio',
    revenue:   'Ingreso',
    expense:   'Gasto',
};

function fmtAmt(n: number) {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const fieldCls = [
    "h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = `font-mono ${APP_SIZES.text.label} uppercase text-neutral-500 dark:text-neutral-400`;

// ── Row type ──────────────────────────────────────────────────────────────────

interface BalanceRow extends TrialBalanceLine {
    typeLabel:   string;
    debitFmt:    string;
    creditFmt:   string;
    balanceFmt:  string;
    isNegative:  boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrialBalancePage() {
    const filterId                   = useId();
    const { companyId }              = useCompany();
    const { data: periods }          = useAccountingPeriods(companyId);
    const [periodId, setPeriodId]    = useState<string>('');

    const { data: rows, loading } = useTrialBalance(companyId, periodId || null);

    const totalDebit  = rows.reduce((s, r) => s + r.totalDebit,  0);
    const totalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);

    const displayRows: BalanceRow[] = rows.map((r) => ({
        ...r,
        typeLabel:  ACCOUNT_TYPE_LABELS[r.accountType] ?? r.accountType,
        debitFmt:   fmtAmt(r.totalDebit),
        creditFmt:  fmtAmt(r.totalCredit),
        balanceFmt: fmtAmt(r.balance),
        isNegative: r.balance < 0,
    }));

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full">
                <PageHeader title="Balance de Comprobación" />

                <div className="flex flex-col gap-6 p-8 max-w-5xl">

                    {/* ── Period filter ──────────────────────────────── */}
                    <div className="flex items-center gap-3">
                        <label htmlFor={`${filterId}-period`} className={labelCls}>
                            Período:
                        </label>
                        <select
                            id={`${filterId}-period`}
                            value={periodId}
                            onChange={(e) => setPeriodId(e.target.value)}
                            className={`${fieldCls} w-52`}
                        >
                            <option value="">Todos los períodos</option>
                            {periods.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* ── Balance table ──────────────────────────────── */}
                    <BaseTable.Render<BalanceRow>
                        columns={[
                            {
                                key: 'accountCode',
                                label: 'Código',
                                render: (v) => (
                                    <span className="font-mono text-[13px] tabular-nums text-neutral-400">{String(v)}</span>
                                ),
                            },
                            { key: 'accountName', label: 'Cuenta' },
                            { key: 'typeLabel',   label: 'Tipo' },
                            {
                                key: 'debitFmt',
                                label: 'Débito',
                                align: 'end',
                                render: (v) => (
                                    <span className="font-mono text-[13px] tabular-nums">{String(v)}</span>
                                ),
                            },
                            {
                                key: 'creditFmt',
                                label: 'Crédito',
                                align: 'end',
                                render: (v) => (
                                    <span className="font-mono text-[13px] tabular-nums">{String(v)}</span>
                                ),
                            },
                            {
                                key: 'balanceFmt',
                                label: 'Saldo',
                                align: 'end',
                                render: (_v, item) => (
                                    <span
                                        className={`font-mono text-[13px] tabular-nums font-semibold ${
                                            item.isNegative ? 'text-[var(--text-error)]' : ''
                                        }`}
                                    >
                                        {item.balanceFmt}
                                    </span>
                                ),
                            },
                        ]}
                        data={displayRows}
                        keyExtractor={(item) => item.accountId}
                        isLoading={loading}
                        emptyContent={
                            <div className="flex flex-col items-center gap-2">
                                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-neutral-400">
                                    Sin movimientos
                                </span>
                                <span className="font-mono text-[11px] text-neutral-400">
                                    No hay movimientos contables publicados para el período seleccionado.
                                </span>
                            </div>
                        }
                    />

                    {/* ── Totals summary ─────────────────────────────── */}
                    {rows.length > 0 && (
                        <div className="flex items-center gap-6 px-4 py-3 border border-border-light rounded-xl bg-surface-2">
                            <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-neutral-400 mr-auto">
                                Totales
                            </span>
                            <span className="font-mono text-[12px] text-neutral-500">
                                Débito:{' '}
                                <span className="text-foreground tabular-nums font-semibold">{fmtAmt(totalDebit)}</span>
                            </span>
                            <span className="font-mono text-[12px] text-neutral-500">
                                Crédito:{' '}
                                <span className="text-foreground tabular-nums font-semibold">{fmtAmt(totalCredit)}</span>
                            </span>
                            <span className="font-mono text-[12px] text-neutral-500">
                                Diferencia:{' '}
                                <span
                                    className={`tabular-nums font-semibold ${
                                        Math.abs(totalDebit - totalCredit) > 0.01
                                            ? 'text-[var(--text-error)]'
                                            : 'text-foreground'
                                    }`}
                                >
                                    {fmtAmt(totalDebit - totalCredit)}
                                </span>
                            </span>
                        </div>
                    )}

                </div>
            </div>
        </AccountingAccessGuard>
    );
}
