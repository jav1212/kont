"use client";

// Payroll module dashboard (tablero).
// Read-only situational anchor for the Nómina module. Every action navigates
// into a sub-page. Designed for a contador managing 5–30 tenants who needs to
// know — at a glance — what is pending this period, what was confirmed, and
// what the BCV rate is right now.

import { useEffect, useMemo } from "react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import {
    Calculator, Users, History, Palmtree, Coins, UserMinus, Plus,
    AlertCircle, ArrowRight, FileText, TrendingUp, Wallet,
    CheckCircle2, Clock, CalendarDays, Receipt,
} from "lucide-react";
import { motion } from "framer-motion";
import { PageHeader }            from "@/src/shared/frontend/components/page-header";
import { DashboardKpiCard }      from "@/src/shared/frontend/components/dashboard-kpi-card";
import { DashboardQuickActions } from "@/src/shared/frontend/components/dashboard-quick-actions";
import { BaseButton }            from "@/src/shared/frontend/components/base-button";
import { useCompany }            from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee }           from "@/src/modules/payroll/frontend/hooks/use-employee";
import { usePayrollHistory }     from "@/src/modules/payroll/frontend/hooks/use-payroll-history";
import { useBcvRate }            from "@/src/shared/frontend/components/bcv-pill";
import { getHolidaysInRange }    from "@/src/modules/payroll/frontend/utils/venezuela-holidays";

// ── constants ────────────────────────────────────────────────────────────────

const MONTH_FULL  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTH_SHORT = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

const QUICK_ACTIONS = [
    { href: "/payroll",                 label: "Calculadora",   desc: "Calcular nómina quincenal",        icon: Calculator },
    { href: "/payroll/employees",       label: "Empleados",     desc: "Gestionar plantilla de empleados", icon: Users      },
    { href: "/payroll/history",         label: "Historial",     desc: "Nóminas confirmadas por período",  icon: History    },
    { href: "/payroll/vacations",       label: "Vacaciones",    desc: "Control de días de vacaciones",    icon: Palmtree   },
    { href: "/payroll/social-benefits", label: "Prestaciones",  desc: "Cálculo de prestaciones sociales", icon: Coins      },
    { href: "/payroll/liquidations",    label: "Liquidaciones", desc: "Finiquitos y pagos de salida",     icon: UserMinus  },
];

// ── helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

function fmtBs(n: number, frac = 2): string {
    return n.toLocaleString("es-VE", { minimumFractionDigits: frac, maximumFractionDigits: frac });
}
function fmtCompactBs(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toLocaleString("es-VE", { maximumFractionDigits: 1 }) + "M";
    if (n >= 10_000)    return (n / 1_000).toLocaleString("es-VE", { maximumFractionDigits: 1 }) + "K";
    return n.toLocaleString("es-VE", { maximumFractionDigits: 0 });
}
function fmtUsd(n: number): string {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDay(iso: string): string {
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}
function fmtRelative(iso: string): string {
    const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return "hoy";
    if (days === 1) return "ayer";
    if (days < 30)  return `hace ${days} d`;
    if (days < 60)  return "hace 1 mes";
    return `hace ${Math.round(days / 30)} m`;
}

interface QuincenaState {
    n:             1 | 2;
    rangeLabel:    string;       // "1–15 abr"
    startIso:      string;
    endIso:        string;
    confirmed:     boolean;
    inProgress:    boolean;
    upcoming:      boolean;
    daysRemaining: number;       // only if inProgress
}

function buildQuincenas(
    year: number, month: number, runs: { periodStart: string; periodEnd: string }[],
): { q1: QuincenaState; q2: QuincenaState; activeIdx: 1 | 2 } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDay = new Date(year, month, 0).getDate();
    const monthShort = MONTH_SHORT[month - 1];

    const make = (n: 1 | 2): QuincenaState => {
        const startDay = n === 1 ? 1 : 16;
        const endDay   = n === 1 ? 15 : lastDay;
        const startIso = `${year}-${pad(month)}-${pad(startDay)}`;
        const endIso   = `${year}-${pad(month)}-${pad(endDay)}`;
        const start = new Date(year, month - 1, startDay);
        const end   = new Date(year, month - 1, endDay);
        const confirmed = runs.some((r) => r.periodStart === startIso && r.periodEnd === endIso);
        const inProgress = today >= start && today <= end;
        const upcoming   = today < start;
        const daysRemaining = inProgress
            ? Math.max(0, Math.round((end.getTime() - today.getTime()) / 86_400_000) + 1)
            : 0;
        return {
            n,
            rangeLabel: `${startDay}–${endDay} ${monthShort}`,
            startIso, endIso,
            confirmed, inProgress, upcoming, daysRemaining,
        };
    };

    return { q1: make(1), q2: make(2), activeIdx: today.getDate() <= 15 ? 1 : 2 };
}

// ── small UI primitives ──────────────────────────────────────────────────────

function StatusPill({ tone, icon, children }: { tone: "success" | "primary" | "warning" | "muted"; icon: React.ReactNode; children: React.ReactNode }) {
    const cls = {
        success: "border-text-success/30 bg-text-success/10 text-text-success",
        primary: "border-primary-500/30 bg-primary-500/10 text-primary-500",
        warning: "border-text-warning/30 bg-text-warning/10 text-text-warning",
        muted:   "border-border-light bg-surface-2 text-[var(--text-tertiary)]",
    }[tone];
    return (
        <div className={[
            "inline-flex items-center gap-1.5 h-6 px-2 rounded-md border font-mono text-[10px] uppercase tracking-[0.14em] font-semibold",
            cls,
        ].join(" ")}>
            {icon}
            <span>{children}</span>
        </div>
    );
}

function QuincenaCard({ state, isActive }: { state: QuincenaState; isActive: boolean }) {
    let pill: React.ReactNode;
    let frame = "border-border-light";
    let ring  = "";

    if (state.confirmed) {
        pill  = <StatusPill tone="success" icon={<CheckCircle2 size={11} strokeWidth={2.4} />}>Confirmada</StatusPill>;
        frame = "border-text-success/25";
    } else if (state.inProgress) {
        pill  = (
            <StatusPill tone="primary" icon={<Clock size={11} strokeWidth={2.4} className={state.daysRemaining <= 3 ? "animate-pulse" : ""} />}>
                {state.daysRemaining}d restantes
            </StatusPill>
        );
        frame = "border-primary-500/40";
        ring  = "shadow-[0_0_0_1px_rgba(255,74,24,0.06)]";
    } else if (state.upcoming) {
        pill  = <StatusPill tone="muted" icon={<CalendarDays size={11} strokeWidth={2.4} />}>Próxima</StatusPill>;
    } else {
        // past, not confirmed
        pill  = <StatusPill tone="warning" icon={<AlertCircle size={11} strokeWidth={2.4} />}>Vencida</StatusPill>;
        frame = "border-text-warning/30";
    }

    return (
        <div className={["relative flex flex-col gap-2 rounded-xl border bg-surface-1 p-4 transition-colors", frame, ring].join(" ")}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={[
                        "inline-flex items-center justify-center h-6 px-2 rounded-md font-mono text-[12px] font-black tracking-tight",
                        isActive ? "bg-primary-500 text-white" : "bg-surface-2 text-foreground border border-border-light",
                    ].join(" ")}>
                        Q{state.n}
                    </span>
                    <span className="font-mono text-[12px] text-[var(--text-secondary)] tabular-nums">{state.rangeLabel}</span>
                </div>
                {pill}
            </div>
            <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                    {state.confirmed ? "Lista" : state.inProgress ? "En curso" : state.upcoming ? "Pendiente" : "Sin cerrar"}
                </span>
                {state.confirmed ? (
                    <Link
                        href="/payroll/history"
                        className="font-mono text-[11px] uppercase tracking-[0.12em] text-primary-500 hover:text-primary-600 inline-flex items-center gap-1"
                    >
                        Ver recibos <ArrowRight size={11} strokeWidth={2.4} />
                    </Link>
                ) : (
                    <Link
                        href="/payroll"
                        className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-primary-500 inline-flex items-center gap-1"
                    >
                        Calcular <ArrowRight size={11} strokeWidth={2.4} />
                    </Link>
                )}
            </div>
        </div>
    );
}

// ── component ────────────────────────────────────────────────────────────────

export default function PayrollDashboard() {
    const { companyId, company }                 = useCompany();
    const { employees, loading: empLoading }     = useEmployee(companyId);
    const { runs, loading: runsLoading, reload } = usePayrollHistory(companyId);
    const bcv = useBcvRate();

    useEffect(() => { void reload(); }, [reload]);

    // ── Period anchors ──────────────────────────────────────────────────────
    const now           = useMemo(() => new Date(), []);
    const year          = now.getFullYear();
    const month         = now.getMonth() + 1;
    const periodLabel   = `${MONTH_FULL[month - 1]} ${year}`;
    const totalRuns     = runs.length;
    const lastRunIso    = runs[0]?.confirmedAt ?? runs[0]?.createdAt ?? null;

    // ── Quincena situation ──────────────────────────────────────────────────
    const quincenas = useMemo(() => buildQuincenas(year, month, runs), [year, month, runs]);
    const confirmedThisMonth = (quincenas.q1.confirmed ? 1 : 0) + (quincenas.q2.confirmed ? 1 : 0);

    // ── Employee numbers ────────────────────────────────────────────────────
    const activeEmployees     = employees.filter((e) => e.estado === "activo");
    const onVacation          = employees.filter((e) => e.estado === "vacacion").length;
    const inactiveCount       = employees.filter((e) => e.estado === "inactivo").length;
    const activeCount         = activeEmployees.length;
    const totalCount          = employees.length;

    // Salaries are stored either in VES or USD per row. Normalise to VES using BCV.
    const bcvRate = bcv?.rate ?? 0;
    const monthlySalaryBs = useMemo(() => {
        return activeEmployees.reduce((s, e) => {
            const inVes = e.moneda === "USD" ? e.salarioMensual * bcvRate : e.salarioMensual;
            return s + (inVes || 0);
        }, 0);
    }, [activeEmployees, bcvRate]);
    const avgSalaryBs   = activeCount > 0 ? monthlySalaryBs / activeCount : 0;
    const monthlySalaryUsd = bcvRate > 0 ? monthlySalaryBs / bcvRate : 0;
    const avgSalaryUsd     = bcvRate > 0 ? avgSalaryBs / bcvRate     : 0;

    // ── Holidays in current month ──────────────────────────────────────────
    const monthHolidays = useMemo(() => {
        const lastDay = new Date(year, month, 0).getDate();
        return getHolidaysInRange(`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(lastDay)}`);
    }, [year, month]);

    // ────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30 font-mono">
            <PageHeader
                title="Nómina"
                subtitle={
                    <div className="flex items-center gap-2">
                        <span>Tablero · {periodLabel}</span>
                        <span className="text-border-light/60">·</span>
                        <span>{confirmedThisMonth}/2 confirmadas</span>
                    </div>
                }
            >
                {bcv && (
                    <Link
                        href="/tools/divisas"
                        aria-label={`Tasa BCV ${bcv.value} bolívares, publicada el ${bcv.date}`}
                        className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border-light bg-surface-1 hover:border-border-medium transition-colors shadow-sm"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-500" aria-hidden />
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--text-secondary)]">BCV</span>
                        <span className="font-mono text-[12px] tabular-nums font-bold text-foreground">{bcv.value}</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{bcv.date}</span>
                    </Link>
                )}
                <BaseButton.Root
                    as={Link}
                    href="/payroll"
                    variant="primary"
                    size="md"
                    leftIcon={<Plus size={16} strokeWidth={3} />}
                >
                    Nueva nómina
                </BaseButton.Root>
            </PageHeader>

            <div className="flex flex-col gap-8 px-8 py-8 max-w-[1400px] mx-auto w-full">

                {/* ── Warning: no active employees ───────────────────────── */}
                {!empLoading && activeCount === 0 && totalCount === 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-text-warning/25 bg-text-warning/[0.06] px-6 py-4 flex items-center justify-between gap-4"
                    >
                        <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-text-warning/10 border border-text-warning/20 text-text-warning">
                                <AlertCircle size={20} strokeWidth={2} />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-mono text-[13px] font-bold uppercase tracking-[0.1em] text-foreground">
                                    Sin empleados registrados
                                </span>
                                <span className="font-sans text-[13px] text-[var(--text-secondary)]">
                                    Agrega empleados antes de generar la primera nómina.
                                </span>
                            </div>
                        </div>
                        <BaseButton.Root
                            as={Link}
                            href="/payroll/employees"
                            variant="secondary"
                            size="sm"
                            rightIcon={<ArrowRight size={14} />}
                        >
                            Ir a Empleados
                        </BaseButton.Root>
                    </motion.div>
                )}

                {/* ── Quincena status panel ──────────────────────────────── */}
                <motion.section
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm"
                >
                    <div className="px-6 py-4 border-b border-border-light flex items-center justify-between bg-surface-1">
                        <div className="flex items-center gap-3">
                            <span className="w-1 h-3 rounded-full bg-primary-500" />
                            <h2 className="font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                                Quincenas de {MONTH_FULL[month - 1]}
                            </h2>
                        </div>
                        {company && (
                            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] truncate max-w-[40%]">
                                {company.name}
                            </span>
                        )}
                    </div>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <QuincenaCard state={quincenas.q1} isActive={quincenas.activeIdx === 1} />
                        <QuincenaCard state={quincenas.q2} isActive={quincenas.activeIdx === 2} />
                    </div>
                </motion.section>

                {/* ── KPIs ──────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DashboardKpiCard
                        label="Empleados activos"
                        value={activeCount}
                        sublabel={
                            totalCount === 0
                                ? "Sin plantilla cargada"
                                : `${totalCount} total · ${onVacation} vac · ${inactiveCount} inact`
                        }
                        color="primary"
                        loading={empLoading}
                        icon={Users}
                    />
                    <DashboardKpiCard
                        label="Nómina mensual"
                        value={`Bs. ${fmtCompactBs(monthlySalaryBs)}`}
                        sublabel={
                            bcvRate > 0 && monthlySalaryUsd > 0
                                ? `≈ $${fmtUsd(monthlySalaryUsd)} USD`
                                : bcvRate === 0
                                    ? "Sin tasa BCV"
                                    : "—"
                        }
                        color="success"
                        loading={empLoading}
                        icon={Wallet}
                        hint="Suma de salarios mensuales de empleados activos."
                    />
                    <DashboardKpiCard
                        label="Salario promedio"
                        value={activeCount > 0 ? `Bs. ${fmtCompactBs(avgSalaryBs)}` : "—"}
                        sublabel={
                            activeCount > 0 && bcvRate > 0
                                ? `≈ $${fmtUsd(avgSalaryUsd)} USD`
                                : "—"
                        }
                        color="default"
                        loading={empLoading}
                        icon={TrendingUp}
                    />
                    <DashboardKpiCard
                        label="Última nómina"
                        value={lastRunIso ? fmtRelative(lastRunIso) : "—"}
                        sublabel={`${totalRuns} confirmadas en total`}
                        color={confirmedThisMonth === 0 ? "warning" : "default"}
                        loading={runsLoading}
                        icon={Receipt}
                    />
                </div>

                {/* ── 2-col body: recent runs + sidebar ─────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Recent runs */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="lg:col-span-2 rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm"
                    >
                        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                                <h2 className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                    Nóminas recientes
                                </h2>
                            </div>
                            <BaseButton.Root
                                as={Link}
                                href="/payroll/history"
                                variant="ghost"
                                size="sm"
                                rightIcon={<ArrowRight size={14} />}
                            >
                                Ver todas
                            </BaseButton.Root>
                        </div>

                        {runsLoading ? (
                            <div className="px-6 py-10 text-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                Cargando…
                            </div>
                        ) : runs.length === 0 ? (
                            <div className="px-6 py-12 flex flex-col items-center text-center gap-3">
                                <div className="h-14 w-14 rounded-2xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                    <FileText size={26} strokeWidth={1.6} />
                                </div>
                                <div className="flex flex-col gap-0.5 max-w-[280px]">
                                    <h3 className="font-mono text-[13px] font-bold uppercase tracking-[0.12em] text-foreground">
                                        Sin historial
                                    </h3>
                                    <p className="font-sans text-[13px] text-[var(--text-tertiary)] leading-snug">
                                        Calcula tu primera nómina para empezar a registrar el histórico.
                                    </p>
                                </div>
                                <BaseButton.Root
                                    as={Link}
                                    href="/payroll"
                                    variant="primary"
                                    size="sm"
                                    leftIcon={<Plus size={14} strokeWidth={3} />}
                                    className="mt-1"
                                >
                                    Calcular primera nómina
                                </BaseButton.Root>
                            </div>
                        ) : (
                            <ul className="divide-y divide-border-light/60">
                                {runs.slice(0, 6).map((run) => {
                                    const startDay = Number(run.periodStart.slice(8, 10));
                                    const isQ1     = startDay === 1;
                                    const isQ2     = startDay === 16;
                                    const tag      = isQ1 ? "Q1" : isQ2 ? "Q2" : "Sem";
                                    const monthIdx = Number(run.periodStart.slice(5, 7)) - 1;
                                    const periodTxt = `${fmtDay(run.periodStart)} – ${fmtDay(run.periodEnd)}`;
                                    return (
                                        <li key={run.id}>
                                            <Link
                                                href="/payroll/history"
                                                className="group flex items-center gap-4 px-6 py-3.5 hover:bg-surface-2/50 transition-colors"
                                            >
                                                <span className="inline-flex items-center justify-center h-7 w-9 rounded-md bg-primary-500/10 border border-primary-500/20 font-mono text-[11px] font-black tracking-tight text-primary-500 shrink-0">
                                                    {tag}
                                                </span>
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <span className="font-mono text-[13px] font-semibold text-foreground tabular-nums truncate">
                                                        {periodTxt}
                                                    </span>
                                                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                                        {MONTH_FULL[monthIdx]} · {fmtRelative(run.confirmedAt ?? run.createdAt)}
                                                    </span>
                                                </div>
                                                <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
                                                    <span className="font-mono text-[12px] font-bold tabular-nums text-foreground">
                                                        {fmtBs(run.exchangeRate, 2)}
                                                    </span>
                                                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                                        Bs / USD
                                                    </span>
                                                </div>
                                                <ArrowRight
                                                    size={14}
                                                    strokeWidth={2}
                                                    className="text-[var(--text-tertiary)] group-hover:text-primary-500 transition-colors shrink-0"
                                                />
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </motion.div>

                    {/* Sidebar: feriados del mes */}
                    <motion.aside
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm flex flex-col"
                    >
                        <div className="px-5 py-4 border-b border-border-light flex items-center gap-2">
                            <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                            <h2 className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                Feriados de {MONTH_FULL[month - 1]}
                            </h2>
                        </div>
                        {monthHolidays.length === 0 ? (
                            <div className="flex-1 px-5 py-8 flex flex-col items-center text-center gap-2">
                                <CalendarDays size={20} strokeWidth={1.8} className="text-[var(--text-tertiary)]" />
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)] leading-snug max-w-[200px]">
                                    Sin días feriados nacionales este mes.
                                </p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-border-light/60">
                                {monthHolidays.map((h) => {
                                    const d = new Date(h.date + "T00:00:00");
                                    const past = d < new Date(new Date().setHours(0, 0, 0, 0));
                                    return (
                                        <li key={h.date} className="px-5 py-3 flex items-center justify-between">
                                            <div className="flex flex-col min-w-0">
                                                <span className={[
                                                    "font-mono text-[12px] truncate",
                                                    past ? "text-[var(--text-tertiary)] line-through" : "text-foreground",
                                                ].join(" ")}>
                                                    {h.name}
                                                </span>
                                                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                                    {d.toLocaleDateString("es-VE", { weekday: "short" }).replace(".", "")}
                                                </span>
                                            </div>
                                            <span className="font-mono text-[12px] tabular-nums font-semibold text-primary-500 shrink-0">
                                                {fmtDay(h.date)}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        <div className="mt-auto px-5 py-3 border-t border-border-light bg-surface-2/40">
                            <p className="font-sans text-[11px] text-[var(--text-tertiary)] leading-snug">
                                Los feriados nacionales se descuentan de los días normales y se pagan aparte (Art. 190 LOTTT).
                            </p>
                        </div>
                    </motion.aside>
                </div>

                {/* ── Quick actions ─────────────────────────────────────── */}
                <DashboardQuickActions actions={QUICK_ACTIONS} />

            </div>
        </div>
    );
}
