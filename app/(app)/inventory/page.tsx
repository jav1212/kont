"use client";

// Inventory dashboard page.
// Shows KPI cards and a product snapshot for the current period.

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { 
    Package, 
    ArrowDownLeft, 
    ArrowUpRight, 
    Boxes, 
    ArrowRightLeft, 
    History,
    ArrowRight,
    Search
} from "lucide-react";
import { PageHeader }            from "@/src/shared/frontend/components/page-header";
import { DashboardKpiCard }      from "@/src/shared/frontend/components/dashboard-kpi-card";
import { DashboardQuickActions } from "@/src/shared/frontend/components/dashboard-quick-actions";
import { currentPeriod }         from "@/src/shared/frontend/utils/current-period";
import { useCompany }            from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory }          from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { BaseButton }            from "@/src/shared/frontend/components/base-button";
import { motion }                from "framer-motion";

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
        <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30 font-mono">
            <PageHeader title="Inventario" subtitle={`Tablero — ${periodo}`}>
                <BaseButton.Root
                    as={Link}
                    href="/inventory/purchases/new"
                    variant="primary"
                    size="md"
                    leftIcon={<ArrowDownLeft size={16} strokeWidth={3} />}
                >
                    + Entrada
                </BaseButton.Root>
                <BaseButton.Root
                    as={Link}
                    href="/inventory/sales"
                    variant="secondary"
                    size="md"
                    leftIcon={<ArrowUpRight size={16} />}
                >
                    + Salida
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <DashboardKpiCard 
                        label="Productos activos" 
                        value={kpis.activos}  
                        color="primary" 
                        loading={loading} 
                        icon={Package}
                    />
                    <DashboardKpiCard 
                        label="Entradas del mes"  
                        value={kpis.entradas} 
                        color="success" 
                        loading={loading} 
                        icon={ArrowDownLeft}
                    />
                    <DashboardKpiCard 
                        label="Salidas del mes"   
                        value={kpis.salidas}  
                        color="danger"  
                        loading={loading} 
                        icon={ArrowUpRight}
                    />
                </div>

                {/* Products snapshop table */}
                <div className="flex flex-col gap-4">
                    <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] flex items-center gap-2">
                        <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                        Snapshop de Inventario
                    </h2>

                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm shadow-black/5"
                    >
                        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between bg-surface-1/50">
                            <p className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                                Productos Recientes
                            </p>
                            <BaseButton.Root
                                as={Link}
                                href="/inventory/products"
                                variant="ghost"
                                size="sm"
                                rightIcon={<ArrowRight size={14} />}
                            >
                                Ver todos
                            </BaseButton.Root>
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
                                    <tr className="bg-surface-2/30 border-b border-border-light">
                                        {["Código", "Nombre", "Tipo", "Existencia", "Estado"].map((h) => (
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
                    </motion.div>
                </div>

                {/* Quick actions grid */}
                <DashboardQuickActions
                    actions={[
                        { 
                            href: "/inventory/production",  
                            label: "Producción",      
                            desc: "Transformaciones y lotes",
                            icon: Boxes
                        },
                        { 
                            href: "/inventory/movements",   
                            label: "Ajustes / Devol.", 
                            desc: "Correcciones y devoluciones",
                            icon: ArrowRightLeft
                        },
                        { 
                            href: "/inventory/kardex",      
                            label: "Kardex",           
                            desc: "Historial por producto",
                            icon: History
                        },
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
