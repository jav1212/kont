"use client";

// Payroll module dashboard (tablero).
// Entry point for the Nómina module — accessible on both web and PWA/mobile.
// Shows key payroll indicators and quick navigation to main payroll operations.
// Constraint: read-only; all mutations happen inside the specific sub-pages.

import { useEffect } from "react";
import Link from "next/link";
import { 
    Calculator, 
    Users, 
    History, 
    Palmtree, 
    Coins, 
    UserMinus, 
    Plus,
    AlertCircle,
    ArrowRight,
    FileText,
    TrendingUp
} from "lucide-react";
import { PageHeader }              from "@/src/shared/frontend/components/page-header";
import { DashboardKpiCard }        from "@/src/shared/frontend/components/dashboard-kpi-card";
import { DashboardQuickActions }   from "@/src/shared/frontend/components/dashboard-quick-actions";
import { currentPeriod }           from "@/src/shared/frontend/utils/current-period";
import { useCompany }              from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee }             from "@/src/modules/payroll/frontend/hooks/use-employee";
import { usePayrollHistory }       from "@/src/modules/payroll/frontend/hooks/use-payroll-history";
import { motion }                  from "framer-motion";
import { BaseButton }              from "@/src/shared/frontend/components/base-button";

// ── quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
    { href: "/payroll",                 label: "Calculadora",   desc: "Calcular nómina quincenal",        icon: Calculator  },
    { href: "/payroll/employees",       label: "Empleados",     desc: "Gestionar plantilla de empleados", icon: Users       },
    { href: "/payroll/history",         label: "Historial",     desc: "Nóminas confirmadas por período",  icon: History     },
    { href: "/payroll/vacations",       label: "Vacaciones",    desc: "Control de días de vacaciones",    icon: Palmtree    },
    { href: "/payroll/social-benefits", label: "Prestaciones",  desc: "Cálculo de prestaciones sociales", icon: Coins       },
    { href: "/payroll/liquidations",    label: "Liquidaciones", desc: "Finiquitos y pagos de salida",     icon: UserMinus   },
];

// ── component ─────────────────────────────────────────────────────────────────

export default function PayrollDashboard() {
    const { companyId }                          = useCompany();
    const { employees, loading: empLoading }     = useEmployee(companyId);
    const { runs, loading: runsLoading, reload } = usePayrollHistory(companyId);

    useEffect(() => { void reload(); }, [reload]);

    const periodo         = currentPeriod();
    const activeEmployees = employees.filter((e) => e.estado === "activo").length;
    const periodRuns      = runs.filter((r) => r.periodStart?.startsWith(periodo)).length;
    const totalRuns       = runs.length;

    return (
        <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30">
            <PageHeader title="Nómina" subtitle={`Tablero — ${periodo}`}>
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

                {/* Warning: no active employees */}
                {!empLoading && activeEmployees === 0 && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-2xl border border-warning-500/20 bg-warning-500/5 px-6 py-4 flex items-center justify-between gap-4 backdrop-blur-sm"
                    >
                        <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-500/10 text-[var(--text-warning)]">
                                <AlertCircle size={20} />
                            </div>
                            <div className="flex flex-col text-sm">
                                <span className="font-bold text-foreground">Sin empleados activos</span>
                                <span className="text-[var(--text-secondary)]">
                                    Necesitas agregar empleados antes de poder generar una nómina.
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

                {/* KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <DashboardKpiCard
                        label="Empleados activos"
                        value={activeEmployees}
                        color="primary"
                        loading={empLoading}
                        icon={Users}
                    />
                    <DashboardKpiCard
                        label="Nóminas del mes"
                        value={periodRuns}
                        color="success"
                        loading={runsLoading}
                        icon={TrendingUp}
                    />
                    <DashboardKpiCard
                        label="Nóminas totales"
                        value={totalRuns}
                        color="default"
                        loading={runsLoading}
                        icon={FileText}
                    />
                </div>

                {/* Recent runs or Empty State */}
                {!runsLoading && (
                    <div className="flex flex-col gap-4">
                        <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] flex items-center gap-2">
                            <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                            Nóminas Recientes
                        </h2>
                        
                        {runs.length === 0 ? (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="rounded-3xl border-2 border-dashed border-border-light bg-surface-1/50 px-8 py-12 flex flex-col items-center text-center gap-4"
                            >
                                <div className="h-16 w-16 rounded-2xl bg-surface-2 flex items-center justify-center text-[var(--text-tertiary)] mb-2">
                                    <FileText size={32} strokeWidth={1.5} />
                                </div>
                                <div className="flex flex-col gap-1 max-w-[300px]">
                                    <h3 className="text-[16px] font-bold text-foreground">Sin historial</h3>
                                    <p className="text-[13px] text-[var(--text-tertiary)]">
                                        Registra tu primera nómina para comenzar a visualizar indicadores y reportes.
                                    </p>
                                </div>
                                <BaseButton.Root
                                    as={Link}
                                    href="/payroll"
                                    variant="primary"
                                    size="md"
                                    className="mt-2"
                                >
                                    Calcular primera nómina
                                </BaseButton.Root>
                            </motion.div>
                        ) : (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm shadow-black/5"
                            >
                                <div className="px-6 py-4 border-b border-border-light flex items-center justify-between bg-surface-1/50">
                                    <p className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                                        Últimos 5 registros
                                    </p>
                                    <BaseButton.Root
                                        as={Link}
                                        href="/payroll/history"
                                        variant="ghost"
                                        size="sm"
                                        rightIcon={<ArrowRight size={14} />}
                                    >
                                        Historial completo
                                    </BaseButton.Root>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[13px]" aria-label="Nóminas recientes">
                                        <thead>
                                            <tr className="bg-surface-2/30 border-b border-border-light">
                                                {[
                                                    "Período inicio",
                                                    "Período fin",
                                                    "Tipo de cambio (Bs/USD)",
                                                ].map((h) => (
                                                    <th
                                                        key={h}
                                                        scope="col"
                                                        className="px-6 py-3.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-tertiary)]"
                                                    >
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-light/50">
                                            {runs.slice(0, 5).map((run) => (
                                                <tr
                                                    key={run.id}
                                                    className="hover:bg-surface-2/50 transition-colors group text-sm"
                                                >
                                                    <td className="px-6 py-4 text-[var(--text-secondary)] tabular-nums">
                                                        {run.periodStart}
                                                    </td>
                                                    <td className="px-6 py-4 text-foreground tabular-nums">
                                                        {run.periodEnd}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono font-bold text-foreground tabular-nums">
                                                                {run.exchangeRate
                                                                    ? run.exchangeRate.toLocaleString("es-VE", {
                                                                          minimumFractionDigits: 2,
                                                                          maximumFractionDigits: 2,
                                                                      })
                                                                    : "—"}
                                                            </span>
                                                            <span className="text-[11px] text-[var(--text-tertiary)]">Bs/USD</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </motion.div>
                        )}
                    </div>
                )}

                {/* Quick actions */}
                <DashboardQuickActions actions={QUICK_ACTIONS} />

            </div>
        </div>
    );
}
