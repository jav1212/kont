"use client";

// Accounting module dashboard (tablero).
// Entry point for the Contabilidad module — shows KPIs and quick navigation.
// Uses the same shared dashboard primitives as Nómina, Inventario, and Documentos.
// Constraint: read-only; all mutations happen inside the specific sub-pages.

import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader }              from "@/src/shared/frontend/components/page-header";
import { DashboardKpiCard }        from "@/src/shared/frontend/components/dashboard-kpi-card";
import { DashboardQuickActions }   from "@/src/shared/frontend/components/dashboard-quick-actions";
import { currentPeriod }           from "@/src/shared/frontend/utils/current-period";
import { AccountingAccessGuard }   from "@/src/modules/accounting/frontend/components/accounting-access-guard";
import { useCompany }              from "@/src/modules/companies/frontend/hooks/use-companies";
import { useAccountingPeriods }    from "@/src/modules/accounting/frontend/hooks/use-accounting-periods";
import { useAccounts }             from "@/src/modules/accounting/frontend/hooks/use-accounts";

// ── quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
    { href: "/accounting/charts",        label: "Planes de Cuentas",       desc: "Importar y gestionar planes de cuentas completos"   },
    { href: "/accounting/accounts",      label: "Cuentas",                 desc: "Catálogo jerárquico de cuentas contables"         },
    { href: "/accounting/periods",       label: "Períodos",                desc: "Administrar períodos contables abiertos y cerrados" },
    { href: "/accounting/journal",       label: "Libro Diario",            desc: "Crear y consultar asientos contables"              },
    { href: "/accounting/trial-balance", label: "Balance de Comprobación", desc: "Resumen de débitos, créditos y saldos por cuenta"  },
    { href: "/accounting/integrations",  label: "Integraciones",           desc: "Configurar asientos automáticos desde otros módulos" },
];

// ── component ─────────────────────────────────────────────────────────────────

export default function AccountingDashboard() {
    const { companyId }                           = useCompany();
    const { data: periods, loading: perLoading }  = useAccountingPeriods(companyId);
    const { data: accounts, loading: accLoading } = useAccounts(companyId);

    const periodo      = currentPeriod();
    const openPeriods  = periods.filter((p) => p.status === "open");
    const closedPeriods = periods.filter((p) => p.status === "closed").length;

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full bg-surface-2 font-mono">
                <PageHeader title="Contabilidad" subtitle={`Tablero — ${periodo}`}>
                    <Link
                        href="/accounting/journal/new"
                        className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[13px] uppercase tracking-[0.12em] flex items-center gap-1.5 transition-colors"
                    >
                        Nuevo asiento
                    </Link>
                </PageHeader>

                <div className="flex flex-col gap-6 px-8 py-6">

                    {/* Active period status banner */}
                    {openPeriods.length > 0 && (
                        <div className="inline-flex items-center gap-2 self-start px-3 py-2 rounded-lg border border-border-light bg-surface-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                            <span className="font-mono text-[12px] text-[var(--text-secondary)]">
                                Período activo:{" "}
                                <span className="font-semibold text-foreground">
                                    {openPeriods[0].name}
                                </span>
                            </span>
                        </div>
                    )}

                    {/* KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <DashboardKpiCard
                            label="Períodos abiertos"
                            value={openPeriods.length}
                            color="success"
                            loading={perLoading}
                        />
                        <DashboardKpiCard
                            label="Períodos cerrados"
                            value={closedPeriods}
                            color="default"
                            loading={perLoading}
                        />
                        <DashboardKpiCard
                            label="Cuentas contables"
                            value={accounts.length}
                            color="primary"
                            loading={accLoading}
                        />
                    </div>

                    {/* Quick actions */}
                    <DashboardQuickActions actions={QUICK_ACTIONS} />

                </div>
            </div>
        </AccountingAccessGuard>
    );
}
