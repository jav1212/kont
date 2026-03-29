"use client";

// Payroll module dashboard (tablero).
// Entry point for the Nómina module — accessible on both web and PWA/mobile.
// Shows key payroll indicators and quick navigation to main payroll operations.
// Constraint: read-only; all mutations happen inside the specific sub-pages.

import { useEffect } from "react";
import Link from "next/link";
import { PageHeader }              from "@/src/shared/frontend/components/page-header";
import { DashboardKpiCard }        from "@/src/shared/frontend/components/dashboard-kpi-card";
import { DashboardQuickActions }   from "@/src/shared/frontend/components/dashboard-quick-actions";
import { currentPeriod }           from "@/src/shared/frontend/utils/current-period";
import { useCompany }              from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee }             from "@/src/modules/payroll/frontend/hooks/use-employee";
import { usePayrollHistory }       from "@/src/modules/payroll/frontend/hooks/use-payroll-history";

// ── quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
    { href: "/payroll",                  label: "Calculadora",   desc: "Calcular nómina quincenal"          },
    { href: "/payroll/employees",        label: "Empleados",     desc: "Gestionar plantilla de empleados"   },
    { href: "/payroll/history",          label: "Historial",     desc: "Nóminas confirmadas por período"    },
    { href: "/payroll/vacations",        label: "Vacaciones",    desc: "Control de días de vacaciones"      },
    { href: "/payroll/social-benefits",  label: "Prestaciones",  desc: "Cálculo de prestaciones sociales"  },
    { href: "/payroll/liquidations",     label: "Liquidaciones", desc: "Finiquitos y pagos de salida"       },
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
        <div className="flex flex-col min-h-full bg-surface-2 font-mono">
            <PageHeader title="Nómina" subtitle={`Tablero — ${periodo}`}>
                <Link
                    href="/payroll"
                    className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[13px] uppercase tracking-[0.12em] flex items-center gap-1.5 transition-colors"
                >
                    Nueva nómina
                </Link>
            </PageHeader>

            <div className="flex flex-col gap-6 px-8 py-6">

                {/* Warning: no active employees */}
                {!empLoading && activeEmployees === 0 && (
                    <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-3 flex items-center gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-warning)] flex-shrink-0" />
                        <span className="font-mono text-[13px] text-[var(--text-secondary)]">
                            No tienes empleados activos.{" "}
                            <Link href="/payroll/employees" className="text-primary-500 underline font-medium">
                                Agregar empleado
                            </Link>{" "}
                            antes de calcular nómina.
                        </span>
                    </div>
                )}

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <DashboardKpiCard
                        label="Empleados activos"
                        value={activeEmployees}
                        color="primary"
                        loading={empLoading}
                    />
                    <DashboardKpiCard
                        label="Nóminas del mes"
                        value={periodRuns}
                        color="success"
                        loading={runsLoading}
                    />
                    <DashboardKpiCard
                        label="Nóminas totales"
                        value={totalRuns}
                        color="default"
                        loading={runsLoading}
                    />
                </div>

                {/* Recent runs */}
                {!runsLoading && runs.length === 0 && (
                    <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-8 text-center">
                        <p className="font-mono text-[13px] text-[var(--text-tertiary)]">
                            Aún no hay nóminas confirmadas.{" "}
                            <Link href="/payroll" className="text-primary-500 underline">
                                Calcular primera nómina
                            </Link>
                        </p>
                    </div>
                )}

                {!runsLoading && runs.length > 0 && (
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                            <p className="text-[13px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                Nóminas recientes
                            </p>
                            <Link
                                href="/payroll/history"
                                className="text-[13px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors"
                            >
                                Ver historial <span aria-hidden="true">→</span>
                            </Link>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]" aria-label="Nóminas recientes">
                                <thead>
                                    <tr className="border-b border-border-light">
                                        {[
                                            "Período inicio",
                                            "Período fin",
                                            "Tipo de cambio (Bs/USD)",
                                        ].map((h) => (
                                            <th
                                                key={h}
                                                scope="col"
                                                className="px-4 py-2.5 text-left text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal"
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {runs.slice(0, 5).map((run) => (
                                        <tr
                                            key={run.id}
                                            className="border-b border-border-light/50 hover:bg-surface-2 transition-colors"
                                        >
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums">
                                                {run.periodStart}
                                            </td>
                                            <td className="px-4 py-2.5 text-foreground tabular-nums">
                                                {run.periodEnd}
                                            </td>
                                            <td className="px-4 py-2.5 text-foreground tabular-nums">
                                                {run.exchangeRate
                                                    ? run.exchangeRate.toLocaleString("es-VE", {
                                                          minimumFractionDigits: 2,
                                                          maximumFractionDigits: 2,
                                                      })
                                                    : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Quick actions */}
                <DashboardQuickActions actions={QUICK_ACTIONS} />

            </div>
        </div>
    );
}
