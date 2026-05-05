"use client";

// Accounting module dashboard (tablero).
// Read-only entry point — KPIs, financial-position snapshot, recent entries, quick actions.
// All mutations happen inside the specific sub-pages.

import { useMemo, type ComponentType } from "react";
import {
    Plus,
    ArrowRight,
    AlertCircle,
    CalendarRange,
    BookText,
    Library,
    Workflow,
    Scale,
    TrendingUp,
    TrendingDown,
    FolderTree,
    FileBarChart,
    BookOpen,
    CheckCircle2,
    AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";

import { ContextLink as Link }     from "@/src/shared/frontend/components/context-link";
import { PageHeader }              from "@/src/shared/frontend/components/page-header";
import { DashboardKpiCard }        from "@/src/shared/frontend/components/dashboard-kpi-card";
import { DashboardQuickActions }   from "@/src/shared/frontend/components/dashboard-quick-actions";
import { BaseButton }              from "@/src/shared/frontend/components/base-button";
import { currentPeriod }           from "@/src/shared/frontend/utils/current-period";
import { AccountingAccessGuard }   from "@/src/modules/accounting/frontend/components/accounting-access-guard";
import { useCompany }              from "@/src/modules/companies/frontend/hooks/use-companies";
import { useAccountingPeriods }    from "@/src/modules/accounting/frontend/hooks/use-accounting-periods";
import { useAccounts }             from "@/src/modules/accounting/frontend/hooks/use-accounts";
import { useJournalEntries }       from "@/src/modules/accounting/frontend/hooks/use-journal-entries";
import { useTrialBalance }         from "@/src/modules/accounting/frontend/hooks/use-trial-balance";
import { useIntegrationRules }     from "@/src/modules/accounting/frontend/hooks/use-integration-rules";
import { useIntegrationLog }       from "@/src/modules/accounting/frontend/hooks/use-integration-log";
import {
    buildFinancialStatements,
    type FinancialStatements,
} from "@/src/modules/accounting/frontend/utils/financial-statements";
import type { JournalEntry }     from "@/src/modules/accounting/backend/domain/journal-entry";
import type { IntegrationLogEntry } from "@/src/modules/accounting/backend/domain/integration-log";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtBs(n: number): string {
    return n.toLocaleString("es-VE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

const MONTHS_SHORT = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

function fmtShortDate(iso: string): string {
    const [y, m, d] = iso.split("T")[0].split("-");
    if (!y || !m || !d) return iso;
    const month = MONTHS_SHORT[(Number(m) - 1) | 0] ?? "";
    return `${parseInt(d, 10)} ${month} ${y}`;
}

function fmtRange(startIso: string, endIso: string): string {
    const [, sm, sd] = startIso.split("T")[0].split("-");
    const [, em, ed] = endIso.split("T")[0].split("-");
    const sMonth = MONTHS_SHORT[(Number(sm) - 1) | 0] ?? "";
    const eMonth = MONTHS_SHORT[(Number(em) - 1) | 0] ?? "";
    return `${parseInt(sd, 10)} ${sMonth} – ${parseInt(ed, 10)} ${eMonth}`;
}

// Module-level helper so the impure Date.now() lookup stays out of render bodies
// (React Compiler flags impure calls inside useMemo).
function countRecentErrors(log: IntegrationLogEntry[]): number {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let n = 0;
    for (const l of log) {
        if (l.status !== "error") continue;
        if (new Date(l.createdAt).getTime() >= cutoff) n++;
    }
    return n;
}

// ── source labels (journal entry origin) ────────────────────────────────────

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
    manual:    { label: "Manual",     cls: "bg-surface-2 text-text-secondary border border-border-light" },
    payroll:   { label: "Nómina",     cls: "border badge-info" },
    inventory: { label: "Inventario", cls: "border badge-warning" },
};

// ── quick actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
    { href: "/accounting/charts",               label: "Planes de Cuentas",       desc: "Importar y gestionar planes contables",       icon: Library },
    { href: "/accounting/accounts",             label: "Cuentas",                 desc: "Catálogo jerárquico de cuentas",              icon: FolderTree },
    { href: "/accounting/periods",              label: "Períodos",                desc: "Abrir, cerrar y revisar ejercicios",          icon: CalendarRange },
    { href: "/accounting/journal",              label: "Libro Diario",            desc: "Asientos contables del período",              icon: BookText },
    { href: "/accounting/trial-balance",        label: "Balance de Comprobación", desc: "Débitos, créditos y saldos por cuenta",       icon: Scale },
    { href: "/accounting/financial-statements", label: "Estados Financieros",     desc: "Balance General y Estado de Resultados",      icon: FileBarChart },
    { href: "/accounting/integrations",         label: "Integraciones",           desc: "Asientos automáticos desde otros módulos",    icon: Workflow },
];

// ── component ────────────────────────────────────────────────────────────────

export default function AccountingDashboard() {
    const { companyId } = useCompany();

    const periodo = currentPeriod();

    const { data: periods,  loading: perLoading }   = useAccountingPeriods(companyId);
    const { data: accounts, loading: accLoading }   = useAccounts(companyId);
    const { data: rules,    loading: rulesLoading } = useIntegrationRules(companyId);
    const { data: integLog, loading: logLoading }   = useIntegrationLog(companyId, 50);

    // Active period: prefer the most-recent open period (descending by startDate)
    const activePeriod = useMemo(() => {
        const open = periods.filter((p) => p.status === "open");
        if (open.length === 0) return null;
        return [...open].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    }, [periods]);

    const { data: entries, loading: entriesLoading } = useJournalEntries(
        companyId,
        activePeriod?.id ?? null,
    );
    const { data: trialBalance, loading: tbLoading } = useTrialBalance(
        companyId,
        activePeriod?.id ?? null,
    );

    const closedPeriods    = periods.filter((p) => p.status === "closed").length;
    const openPeriodsCount = periods.filter((p) => p.status === "open").length;

    const accountMetrics = useMemo(() => {
        const active = accounts.filter((a) => a.isActive);
        const groups = accounts.filter((a) => a.isGroup);
        return {
            total:  accounts.length,
            active: active.length,
            groups: groups.length,
        };
    }, [accounts]);

    const entryMetrics = useMemo(() => {
        const posted = entries.filter((e) => e.status === "posted").length;
        const drafts = entries.filter((e) => e.status === "draft").length;
        return { posted, drafts, total: entries.length };
    }, [entries]);

    const integMetrics = useMemo(() => ({
        activeRules:  rules.filter((r) => r.isActive).length,
        recentErrors: countRecentErrors(integLog),
    }), [rules, integLog]);

    const statements = useMemo(
        () => buildFinancialStatements(trialBalance),
        [trialBalance],
    );

    // Top 6 entries — date desc, then entryNumber desc
    const recentEntries = useMemo(() => (
        [...entries]
            .sort((a, b) => {
                const byDate = b.date.localeCompare(a.date);
                if (byDate !== 0) return byDate;
                return b.entryNumber - a.entryNumber;
            })
            .slice(0, 6)
    ), [entries]);

    const hasNoPeriods    = !perLoading && periods.length === 0;
    const hasNoOpenPeriod = !perLoading && periods.length > 0 && openPeriodsCount === 0;
    const hasNoAccounts   = !accLoading && accounts.length === 0;

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30 font-mono">
                <PageHeader title="Contabilidad" subtitle={`Tablero — ${periodo}`}>
                    <BaseButton.Root
                        as={Link}
                        href="/accounting/financial-statements"
                        variant="secondary"
                        size="md"
                        leftIcon={<FileBarChart size={16} />}
                    >
                        Estados financieros
                    </BaseButton.Root>
                    <BaseButton.Root
                        as={Link}
                        href="/accounting/journal/new"
                        variant="primary"
                        size="md"
                        leftIcon={<Plus size={16} strokeWidth={3} />}
                    >
                        Nuevo asiento
                    </BaseButton.Root>
                </PageHeader>

                <div className="flex flex-col gap-8 px-8 py-8 max-w-[1400px] mx-auto w-full">

                    {/* Setup banners */}
                    {hasNoPeriods && (
                        <SetupBanner
                            label="Sin períodos contables"
                            desc="Crea el primer período antes de registrar asientos."
                            cta="Crear período"
                            href="/accounting/periods"
                        />
                    )}
                    {!hasNoPeriods && hasNoOpenPeriod && (
                        <SetupBanner
                            label="Todos los períodos están cerrados"
                            desc="Abre o crea un período para registrar nuevos asientos."
                            cta="Gestionar períodos"
                            href="/accounting/periods"
                        />
                    )}
                    {hasNoAccounts && (
                        <SetupBanner
                            label="Sin plan de cuentas"
                            desc="Importa o crea un plan antes de registrar asientos."
                            cta="Configurar plan"
                            href="/accounting/charts"
                        />
                    )}

                    {/* KPIs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <DashboardKpiCard
                            label="Período activo"
                            value={activePeriod ? activePeriod.name : "—"}
                            sublabel={
                                activePeriod
                                    ? fmtRange(activePeriod.startDate, activePeriod.endDate)
                                    : closedPeriods > 0
                                        ? `${closedPeriods} cerrado${closedPeriods === 1 ? "" : "s"} · ninguno abierto`
                                        : "Aún no hay períodos creados"
                            }
                            color={activePeriod ? "success" : "warning"}
                            loading={perLoading}
                            icon={CalendarRange}
                        />
                        <DashboardKpiCard
                            label="Asientos del período"
                            value={activePeriod ? entryMetrics.posted : "—"}
                            sublabel={
                                activePeriod
                                    ? entryMetrics.drafts > 0
                                        ? `${entryMetrics.drafts} borrador${entryMetrics.drafts === 1 ? "" : "es"} sin postear`
                                        : "Sin borradores pendientes"
                                    : "Selecciona un período activo"
                            }
                            color="primary"
                            loading={perLoading || (activePeriod ? entriesLoading : false)}
                            icon={BookText}
                        />
                        <DashboardKpiCard
                            label="Cuentas contables"
                            value={accountMetrics.active}
                            sublabel={`${accountMetrics.total} totales · ${accountMetrics.groups} grupos`}
                            color="default"
                            loading={accLoading}
                            icon={FolderTree}
                        />
                        <DashboardKpiCard
                            label="Integraciones"
                            value={integMetrics.activeRules}
                            sublabel={
                                integMetrics.recentErrors > 0
                                    ? `${integMetrics.recentErrors} error${integMetrics.recentErrors === 1 ? "" : "es"} en 24 h`
                                    : "Sin errores en 24 h"
                            }
                            color={integMetrics.recentErrors > 0 ? "warning" : "default"}
                            loading={rulesLoading || logLoading}
                            icon={Workflow}
                        />
                    </div>

                    {/* Posición financiera + Asientos recientes */}
                    {activePeriod && (
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                            <FinancialSnapshotCard
                                statements={statements}
                                loading={tbLoading}
                            />
                            <RecentEntriesCard
                                entries={recentEntries}
                                loading={entriesLoading}
                                periodName={activePeriod.name}
                            />
                        </div>
                    )}

                    {/* Quick actions */}
                    <DashboardQuickActions actions={QUICK_ACTIONS} />

                </div>
            </div>
        </AccountingAccessGuard>
    );
}

// ── setup banner (warning tone) ──────────────────────────────────────────────

interface SetupBannerProps {
    label: string;
    desc:  string;
    cta:   string;
    href:  string;
}

function SetupBanner({ label, desc, cta, href }: SetupBannerProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-warning-500/20 bg-warning-500/5 px-6 py-4 flex items-center justify-between gap-4 backdrop-blur-sm"
        >
            <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-500/10 text-[var(--text-warning)]">
                    <AlertCircle size={20} />
                </div>
                <div className="flex flex-col text-sm">
                    <span className="font-bold text-foreground">{label}</span>
                    <span className="text-[var(--text-secondary)] font-sans">{desc}</span>
                </div>
            </div>
            <BaseButton.Root
                as={Link}
                href={href}
                variant="secondary"
                size="sm"
                rightIcon={<ArrowRight size={14} />}
            >
                {cta}
            </BaseButton.Root>
        </motion.div>
    );
}

// ── financial position snapshot (Balance + P&L summary) ─────────────────────

interface FinancialSnapshotCardProps {
    statements: FinancialStatements;
    loading:    boolean;
}

function FinancialSnapshotCard({ statements, loading }: FinancialSnapshotCardProps) {
    const { balanceSheet, incomeStatement } = statements;
    const balanced = Math.abs(balanceSheet.discrepancy) < 0.01;
    const profit   = incomeStatement.netIncome >= 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm lg:col-span-2"
        >
            <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                    Posición financiera
                </p>
                <BaseButton.Root
                    as={Link}
                    href="/accounting/financial-statements"
                    variant="ghost"
                    size="sm"
                    rightIcon={<ArrowRight size={14} />}
                >
                    Ver estados
                </BaseButton.Root>
            </div>

            <div className="px-6 py-5">
                {loading ? (
                    <div className="py-10 text-center text-[13px] text-[var(--text-tertiary)]">
                        Cargando…
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <SnapshotRow
                            label="Activos"
                            value={`Bs. ${fmtBs(balanceSheet.totalAssets)}`}
                            tone="default"
                        />
                        <SnapshotRow
                            label="Pasivo + Patrimonio"
                            value={`Bs. ${fmtBs(balanceSheet.totalLiabilitiesAndEquity)}`}
                            tone="default"
                        />
                        <div className="border-t border-border-light pt-4 flex flex-col gap-3">
                            <SnapshotRow
                                label={profit ? "Utilidad neta" : "Pérdida neta"}
                                value={`Bs. ${fmtBs(Math.abs(incomeStatement.netIncome))}`}
                                tone={profit ? "success" : "error"}
                                icon={profit ? TrendingUp : TrendingDown}
                            />
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-mono uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                                    Cuadre del período
                                </span>
                                {balanced ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium badge-success border">
                                        <CheckCircle2 size={12} />
                                        Cuadrado
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium badge-error border tabular-nums">
                                        <AlertTriangle size={12} />
                                        Desfase Bs. {fmtBs(Math.abs(balanceSheet.discrepancy))}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

interface SnapshotRowProps {
    label: string;
    value: string;
    tone:  "default" | "success" | "error";
    icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
}

function SnapshotRow({ label, value, tone, icon: Icon }: SnapshotRowProps) {
    const valueCls = {
        default: "text-foreground",
        success: "text-text-success",
        error:   "text-text-error",
    }[tone];
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-mono uppercase tracking-[0.1em] text-[var(--text-tertiary)] flex items-center gap-2">
                {Icon && <Icon size={13} strokeWidth={2} />}
                {label}
            </span>
            <span className={`font-mono text-[15px] font-semibold tabular-nums ${valueCls}`}>
                {value}
            </span>
        </div>
    );
}

// ── recent entries panel ─────────────────────────────────────────────────────

interface RecentEntriesCardProps {
    entries:    JournalEntry[];
    loading:    boolean;
    periodName: string;
}

function RecentEntriesCard({ entries, loading, periodName }: RecentEntriesCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm lg:col-span-3"
        >
            <div className="px-6 py-4 border-b border-border-light flex items-center justify-between gap-3">
                <p className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-secondary)] truncate">
                    Asientos recientes — {periodName}
                </p>
                <BaseButton.Root
                    as={Link}
                    href="/accounting/journal"
                    variant="ghost"
                    size="sm"
                    rightIcon={<ArrowRight size={14} />}
                >
                    Ver libro diario
                </BaseButton.Root>
            </div>

            {loading ? (
                <div className="px-5 py-12 text-center text-[13px] text-[var(--text-tertiary)]">
                    Cargando…
                </div>
            ) : entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-8 py-14 gap-3 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-surface-2 flex items-center justify-center text-[var(--text-tertiary)]">
                        <BookOpen size={22} strokeWidth={1.8} />
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)] font-sans max-w-[340px]">
                        Aún no hay asientos en este período.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]" aria-label="Asientos recientes">
                        <thead>
                            <tr className="bg-surface-2/30 border-b border-border-light">
                                {[
                                    { label: "#",           align: "text-right"  },
                                    { label: "Fecha",       align: "text-left"   },
                                    { label: "Descripción", align: "text-left"   },
                                    { label: "Origen",      align: "text-center" },
                                    { label: "Estado",      align: "text-center" },
                                ].map((h) => (
                                    <th
                                        key={h.label}
                                        scope="col"
                                        className={`px-6 py-3.5 ${h.align} text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-tertiary)]`}
                                    >
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light/60">
                            {entries.map((e) => {
                                const sourceCfg = SOURCE_BADGE[e.source] ?? {
                                    label: e.source,
                                    cls:   "bg-surface-2 text-text-secondary border border-border-light",
                                };
                                const isPosted = e.status === "posted";
                                return (
                                    <tr key={e.id} className="hover:bg-surface-2/60 transition-colors">
                                        <td className="px-6 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                                            {e.entryNumber}
                                        </td>
                                        <td className="px-6 py-3 text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                                            {fmtShortDate(e.date)}
                                        </td>
                                        <td className="px-6 py-3 text-foreground">
                                            <Link
                                                href={`/accounting/journal/${e.id}`}
                                                className="block truncate max-w-[360px] hover:text-primary-500 transition-colors"
                                            >
                                                {e.description}
                                            </Link>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium ${sourceCfg.cls}`}>
                                                {sourceCfg.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <span
                                                className={[
                                                    "inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium border",
                                                    isPosted
                                                        ? "badge-success"
                                                        : "bg-surface-2 text-text-secondary border-border-light",
                                                ].join(" ")}
                                            >
                                                {isPosted ? "Posteado" : "Borrador"}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </motion.div>
    );
}
