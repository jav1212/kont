"use client";

// Estados Financieros — vista unificada del Balance General + Estado de
// Resultados a partir del trial balance del período seleccionado. Permite
// descargar cada uno como PDF en marca Konta.

import { useMemo, useState } from "react";
import { Download, FileText, Scale, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { AccountingAccessGuard } from "@/src/modules/accounting/frontend/components/accounting-access-guard";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useAccountingPeriods } from "@/src/modules/accounting/frontend/hooks/use-accounting-periods";
import { useTrialBalance } from "@/src/modules/accounting/frontend/hooks/use-trial-balance";
import {
    buildFinancialStatements,
    type StatementLine,
} from "@/src/modules/accounting/frontend/utils/financial-statements";
import { generateBalanceSheetPdf } from "@/src/modules/accounting/frontend/utils/balance-sheet-pdf";
import { generateIncomeStatementPdf } from "@/src/modules/accounting/frontend/utils/income-statement-pdf";
import { notify } from "@/src/shared/frontend/notify";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

function fmtIsoDate(iso: string): string {
    const [y, m, d] = iso.split("T")[0].split("-");
    if (!y || !m || !d) return iso;
    const month = MONTHS[(Number(m) - 1) | 0] ?? "";
    return `${parseInt(d, 10)} de ${month} de ${y}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function FinancialStatementsPage() {
    const { companyId, company } = useCompany();
    const { data: periods } = useAccountingPeriods(companyId);
    const [periodId, setPeriodId] = useState<string>("");
    const { data: rows, loading } = useTrialBalance(companyId, periodId || null);

    const statements = useMemo(() => buildFinancialStatements(rows), [rows]);
    const period = periods.find((p) => p.id === periodId) ?? null;

    const periodLabel = period?.name ?? "Todos los períodos";
    const cutoffLabel = period?.endDate ? fmtIsoDate(period.endDate) : "fecha actual";
    const rangeLabel  = period
        ? `Del ${fmtIsoDate(period.startDate)} al ${fmtIsoDate(period.endDate)}`
        : "Período acumulado";

    const [pdfBalance, setPdfBalance] = useState(false);
    const [pdfIncome, setPdfIncome]   = useState(false);

    async function handleDownloadBalance() {
        if (!company) return;
        if (!company.rif && !company.id) {
            notify.error("La empresa no tiene RIF configurado.");
            return;
        }
        setPdfBalance(true);
        try {
            await generateBalanceSheetPdf({
                companyName: company.name,
                companyRif:  company.rif ?? company.id,
                periodLabel,
                cutoffLabel,
                sheet: statements.balanceSheet,
            });
            notify.success("Balance General descargado.");
        } catch (e) {
            notify.error(e instanceof Error ? e.message : "Error al generar PDF");
        } finally {
            setPdfBalance(false);
        }
    }

    async function handleDownloadIncome() {
        if (!company) return;
        if (!company.rif && !company.id) {
            notify.error("La empresa no tiene RIF configurado.");
            return;
        }
        setPdfIncome(true);
        try {
            await generateIncomeStatementPdf({
                companyName: company.name,
                companyRif:  company.rif ?? company.id,
                periodLabel,
                rangeLabel,
                statement: statements.incomeStatement,
            });
            notify.success("Estado de Resultados descargado.");
        } catch (e) {
            notify.error(e instanceof Error ? e.message : "Error al generar PDF");
        } finally {
            setPdfIncome(false);
        }
    }

    const balanced = Math.abs(statements.balanceSheet.discrepancy) < 0.01;
    const totalAccounts = rows.length;

    return (
        <AccountingAccessGuard>
            <div className="min-h-full bg-surface-2 font-mono">
                <PageHeader
                    title="Estados Financieros"
                    subtitle={period ? `${period.name} · ${rangeLabel}` : "Período acumulado"}
                />

                <div className="px-8 py-6 space-y-6 max-w-6xl">
                    {/* ── Period selector ──────────────────────────────────── */}
                    <div className="rounded-xl border border-border-light bg-surface-1 p-4 flex items-center gap-4">
                        <div className="flex-1">
                            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1.5">
                                Período contable
                            </label>
                            <select
                                value={periodId}
                                onChange={(e) => setPeriodId(e.target.value)}
                                className="w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground focus:border-primary-500/60"
                            >
                                <option value="">Todos los períodos (acumulado)</option>
                                {periods.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-1.5 self-end h-9 px-3 rounded-lg border border-border-light bg-surface-2/60">
                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                Cuentas con movimiento
                            </span>
                            <span className="font-mono text-[13px] tabular-nums text-foreground font-semibold">
                                {totalAccounts}
                            </span>
                        </div>
                    </div>

                    {/* ── Loading / empty state ─────────────────────────────── */}
                    {loading ? (
                        <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                            Cargando estados financieros…
                        </div>
                    ) : totalAccounts === 0 ? (
                        <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-16 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <FileText size={20} strokeWidth={1.6} />
                            </div>
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin movimientos contables
                            </p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)] max-w-md">
                                Registra y confirma asientos en el libro diario para ver el Balance General y el Estado de Resultados.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* ── Balance General ────────────────────────────── */}
                            <section className="rounded-xl border border-border-light bg-surface-1 overflow-hidden flex flex-col">
                                <header className="px-5 py-3 border-b border-border-light flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <Scale size={14} className="text-primary-500" strokeWidth={2} />
                                        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                                            Balance General
                                        </h2>
                                    </div>
                                    <BaseButton.Root
                                        variant="primary"
                                        size="sm"
                                        onClick={handleDownloadBalance}
                                        loading={pdfBalance}
                                        leftIcon={<Download size={12} strokeWidth={2.2} />}
                                    >
                                        PDF
                                    </BaseButton.Root>
                                </header>

                                <div className="px-5 pt-3 pb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                    <span>Al {cutoffLabel}</span>
                                    <span className="tabular-nums normal-case tracking-normal">
                                        Bs. {fmtN(statements.balanceSheet.totalAssets)}
                                    </span>
                                </div>

                                <SectionTable
                                    label="Activos"
                                    lines={statements.balanceSheet.assets}
                                    total={statements.balanceSheet.totalAssets}
                                    totalLabel="Total Activos"
                                />
                                <SectionTable
                                    label="Pasivos"
                                    lines={statements.balanceSheet.liabilities}
                                    total={statements.balanceSheet.totalLiabilities}
                                    totalLabel="Total Pasivos"
                                />
                                <SectionTable
                                    label="Patrimonio"
                                    lines={statements.balanceSheet.equity}
                                    extra={[{
                                        accountCode: "—",
                                        accountId:   "synthetic-net-income",
                                        accountName: statements.balanceSheet.netIncome >= 0
                                            ? "Utilidad del ejercicio"
                                            : "Pérdida del ejercicio",
                                        amount:      statements.balanceSheet.netIncome,
                                    }]}
                                    total={Math.round((statements.balanceSheet.totalEquity + statements.balanceSheet.netIncome) * 100) / 100}
                                    totalLabel="Total Patrimonio"
                                />

                                {/* Footer: total + cuadre */}
                                <div className="mt-auto border-t-2 border-primary-500/30 px-5 py-3 bg-primary-500/[0.04]">
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] font-bold text-foreground">
                                            Total Pasivos + Patrimonio
                                        </span>
                                        <span className="font-mono text-[14px] tabular-nums font-bold text-foreground">
                                            Bs. {fmtN(statements.balanceSheet.totalLiabilitiesAndEquity)}
                                        </span>
                                    </div>
                                    <div className={[
                                        "mt-2 px-2.5 py-1.5 rounded-md flex items-center gap-2 text-[11px]",
                                        balanced
                                            ? "bg-[var(--badge-success-bg)] border border-[var(--badge-success-border)] text-[var(--text-success)]"
                                            : "bg-[var(--badge-warning-bg)] border border-[var(--badge-warning-border)] text-[var(--text-warning)]",
                                    ].join(" ")}>
                                        {balanced ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                        <span className="font-mono uppercase tracking-[0.10em] font-medium">
                                            {balanced
                                                ? "Balance cuadra"
                                                : `Discrepancia: Bs. ${fmtN(Math.abs(statements.balanceSheet.discrepancy))}`}
                                        </span>
                                    </div>
                                </div>
                            </section>

                            {/* ── Estado de Resultados ───────────────────────── */}
                            <section className="rounded-xl border border-border-light bg-surface-1 overflow-hidden flex flex-col">
                                <header className="px-5 py-3 border-b border-border-light flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp size={14} className="text-primary-500" strokeWidth={2} />
                                        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                                            Estado de Resultados
                                        </h2>
                                    </div>
                                    <BaseButton.Root
                                        variant="primary"
                                        size="sm"
                                        onClick={handleDownloadIncome}
                                        loading={pdfIncome}
                                        leftIcon={<Download size={12} strokeWidth={2.2} />}
                                    >
                                        PDF
                                    </BaseButton.Root>
                                </header>

                                <div className="px-5 pt-3 pb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                    <span>{rangeLabel}</span>
                                    <span className="tabular-nums normal-case tracking-normal">
                                        Bs. {fmtN(statements.incomeStatement.totalRevenues)}
                                    </span>
                                </div>

                                <SectionTable
                                    label="Ingresos"
                                    lines={statements.incomeStatement.revenues}
                                    total={statements.incomeStatement.totalRevenues}
                                    totalLabel="Total Ingresos"
                                />
                                <SectionTable
                                    label="(-) Gastos"
                                    lines={statements.incomeStatement.expenses}
                                    total={statements.incomeStatement.totalExpenses}
                                    totalLabel="Total Gastos"
                                />

                                {/* Footer: utilidad / pérdida + margen */}
                                <div className="mt-auto border-t-2 border-primary-500/30 px-5 py-3 bg-primary-500/[0.04]">
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] font-bold text-foreground">
                                            {statements.incomeStatement.netIncome >= 0 ? "Utilidad neta" : "Pérdida neta"}
                                        </span>
                                        <span className={[
                                            "font-mono text-[14px] tabular-nums font-bold",
                                            statements.incomeStatement.netIncome >= 0 ? "text-[var(--text-success)]" : "text-[var(--text-error)]",
                                        ].join(" ")}>
                                            Bs. {fmtN(statements.incomeStatement.netIncome)}
                                        </span>
                                    </div>
                                    {statements.incomeStatement.totalRevenues > 0 && (
                                        <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                            <span>Margen neto</span>
                                            <span className="font-mono tabular-nums normal-case tracking-normal">
                                                {fmtN((statements.incomeStatement.netIncome / statements.incomeStatement.totalRevenues) * 100)} %
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {/* ── Note ────────────────────────────────────────────── */}
                    <div className="px-4 py-3 rounded-lg border border-info/20 bg-info/[0.05] text-[11px] font-sans text-[var(--text-tertiary)] flex items-start gap-2 leading-snug">
                        <FileText size={14} strokeWidth={2} className="text-info mt-0.5 shrink-0" />
                        <span>
                            Estos estados se construyen únicamente con los <strong>asientos contables confirmados</strong> (status = posted) en el período seleccionado.
                            Para una declaración ISLR formal, asegúrate de tener cerrados todos los asientos del ejercicio fiscal.
                        </span>
                    </div>
                </div>
            </div>
        </AccountingAccessGuard>
    );
}

// ── Section table ───────────────────────────────────────────────────────────

function SectionTable({
    label, lines, extra, total, totalLabel,
}: {
    label:      string;
    lines:      StatementLine[];
    extra?:     StatementLine[];
    total:      number;
    totalLabel: string;
}) {
    const all = [...lines, ...(extra ?? [])];
    return (
        <div className="px-5 py-3 border-b border-border-light/60">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-semibold mb-2">
                {label}
            </div>
            {all.length === 0 ? (
                <div className="font-sans text-[12px] text-[var(--text-tertiary)] italic py-1">
                    — sin movimientos —
                </div>
            ) : (
                <div className="space-y-1">
                    {all.map((line) => (
                        <div key={line.accountId} className="flex items-baseline justify-between gap-2 text-[12px]">
                            <div className="flex items-baseline gap-2 min-w-0">
                                <span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)] w-16 shrink-0">
                                    {line.accountCode}
                                </span>
                                <span className="text-[var(--text-secondary)] truncate">
                                    {line.accountName}
                                </span>
                            </div>
                            <span className="font-mono tabular-nums text-foreground shrink-0">
                                {fmtN(line.amount)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
            <div className="mt-2 pt-2 border-t border-border-light/60 flex items-center justify-between text-[12px]">
                <span className="font-mono uppercase tracking-[0.12em] font-bold text-foreground">
                    {totalLabel}
                </span>
                <span className="font-mono tabular-nums font-bold text-foreground">
                    Bs. {fmtN(total)}
                </span>
            </div>
        </div>
    );
}
