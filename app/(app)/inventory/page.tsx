"use client";

// Inventory dashboard page.
// Shows KPI cards and a product snapshot for the current period.

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { PageHeader }            from "@/src/shared/frontend/components/page-header";
import { DashboardKpiCard }      from "@/src/shared/frontend/components/dashboard-kpi-card";
import { DashboardQuickActions } from "@/src/shared/frontend/components/dashboard-quick-actions";
import { currentPeriod }         from "@/src/shared/frontend/utils/current-period";
import { useCompany }            from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory }          from "@/src/modules/inventory/frontend/hooks/use-inventory";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtN(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// ── component ────────────────────────────────────────────────────────────────

export default function InventoryDashboard() {
    const { companyId } = useCompany();
    const {
        products, movements,
        loadingProducts, loadingMovements,
        loadProducts, loadMovements,
    } = useInventory();

    const periodo = currentPeriod();

    useEffect(() => {
        if (!companyId) return;
        loadProducts(companyId);
        loadMovements(companyId, periodo);
    }, [companyId, periodo, loadProducts, loadMovements]);

    const kpis = useMemo(() => {
        const activos = products.filter((p) => p.active).length;
        const entradas = movements.filter((m) =>
            ["entrada", "entrada_produccion", "devolucion_entrada", "ajuste_positivo"].includes(m.type)
        ).length;
        const salidas = movements.filter((m) =>
            ["salida", "salida_produccion", "devolucion_salida", "ajuste_negativo"].includes(m.type)
        ).length;
        return { activos, entradas, salidas };
    }, [products, movements]);

    const loading = loadingProducts || loadingMovements;

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Inventario" subtitle={`Dashboard — ${periodo}`}>
                <Link
                    href="/inventory/purchases/new"
                    className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[13px] uppercase tracking-[0.12em] flex items-center gap-1.5 transition-colors"
                >
                    + Entrada
                </Link>
                <Link
                    href="/inventory/sales"
                    className="h-9 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[13px] uppercase tracking-[0.12em] flex items-center gap-1.5 transition-colors"
                >
                    + Salida
                </Link>
            </PageHeader>

            <div className="px-8 py-6 space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <DashboardKpiCard label="Productos activos" value={kpis.activos}  color="primary" loading={loading} />
                    <DashboardKpiCard label="Entradas del mes"  value={kpis.entradas} color="success" loading={loading} />
                    <DashboardKpiCard label="Salidas del mes"   value={kpis.salidas}  color="danger"  loading={loading} />
                </div>

                {/* Products table */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <p className="text-[13px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                            Productos
                        </p>
                        <Link
                            href="/inventory/products"
                            className="text-[13px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors"
                        >
                            Ver todos <span aria-hidden="true">→</span>
                        </Link>
                    </div>

                    {loading ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : products.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                            No hay productos.{" "}
                            <Link href="/inventory/products" className="text-primary-500 underline">
                                Crear uno
                            </Link>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                        <table className="w-full text-[13px]" aria-label="Productos">
                            <thead>
                                <tr className="border-b border-border-light">
                                    {["Código", "Nombre", "Tipo", "Existencia", "Estado"].map((h) => (
                                        <th key={h} scope="col" className="px-4 py-2.5 text-left text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {products.slice(0, 20).map((p) => (
                                        <tr key={p.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.code || "—"}</td>
                                            <td className="px-4 py-2.5 text-foreground font-medium">{p.name}</td>
                                            <td className="px-4 py-2.5">
                                                <TipoBadge tipo={p.type} />
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-foreground">
                                                {fmtN(p.currentStock)} {p.measureUnit}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {p.active ? (
                                                    <span className="text-text-success text-[12px] uppercase tracking-[0.10em]">Activo</span>
                                                ) : (
                                                    <span className="text-text-tertiary text-[12px] uppercase tracking-[0.10em]">Inactivo</span>
                                                )}
                                            </td>
                                        </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    )}
                </div>

                {/* Quick links */}
                <DashboardQuickActions
                    actions={[
                        { href: "/inventory/production",  label: "Producción",      desc: "Transformaciones y lotes"    },
                        { href: "/inventory/movements",   label: "Ajustes / Devol.", desc: "Correcciones y devoluciones" },
                        { href: "/inventory/kardex",      label: "Kardex",           desc: "Historial por producto"      },
                    ]}
                />
            </div>
        </div>
    );
}

function TipoBadge({ tipo }: { tipo: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        mercancia:          { label: "Mercancía",        cls: "border badge-info"    },
        materia_prima:      { label: "Mat. Prima",       cls: "border badge-warning" },
        producto_terminado: { label: "Prod. Terminado",  cls: "border badge-success" },
    };
    const { label, cls } = map[tipo] ?? { label: tipo, cls: "bg-surface-2 text-text-secondary border border-border-light" };
    return (
        <span className={`inline-flex px-1.5 py-0.5 rounded text-[12px] uppercase tracking-[0.08em] font-medium ${cls}`}>
            {label}
        </span>
    );
}
