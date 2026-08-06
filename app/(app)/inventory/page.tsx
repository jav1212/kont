"use client";

// Inventory module dashboard.
// Read-only entry point for the module — KPIs, stock alerts, quick actions.
// All mutations happen inside the specific sub-pages.

import { useEffect, useMemo } from "react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import {
    Package,
    ArrowUpRight,
    ArrowRightLeft,
    ArrowRight,
    Plus,
    ShoppingCart,
    Truck,
    AlertTriangle,
    AlertCircle,
    Wallet,
    Activity,
    PackageX,
} from "lucide-react";
import { PageHeader }            from "@/src/shared/frontend/components/page-header";
import { DashboardKpiCard }      from "@/src/shared/frontend/components/dashboard-kpi-card";
import { DashboardQuickActions } from "@/src/shared/frontend/components/dashboard-quick-actions";
import { BaseListCard }          from "@/src/shared/frontend/components/base-list-card";
import { currentPeriod }         from "@/src/shared/frontend/utils/current-period";
import { useCompany }            from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory }          from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { BaseButton }            from "@/src/shared/frontend/components/base-button";
import { motion }                from "framer-motion";

// ── constants ────────────────────────────────────────────────────────────────

// Heuristic low-stock threshold. Product entity has no per-SKU minStock yet,
// so any active product with 0 < stock ≤ 5 is flagged as "en alerta".
const LOW_STOCK_THRESHOLD = 5;

const ENTRY_TYPES = new Set([
    "entrada", "devolucion_entrada", "ajuste_positivo",
]);
const EXIT_TYPES = new Set([
    "salida", "devolucion_salida", "ajuste_negativo",
]);

const QUICK_ACTIONS = [
    { href: "/inventory/products",    label: "Productos",        desc: "Catálogo y fichas de producto",    icon: Package        },
    { href: "/purchases",   label: "Compras",          desc: "Facturas y entradas de mercancía", icon: ShoppingCart   },
    { href: "/purchases/suppliers",   label: "Proveedores",      desc: "Directorio y retenciones",         icon: Truck          },
    { href: "/inventory/operations/new", label: "Operaciones",   desc: "Ajustes, devoluciones y autoconsumo", icon: ArrowRightLeft },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtBs(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function fmtRate(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// ── component ────────────────────────────────────────────────────────────────

export default function InventoryDashboard() {
    const { companyId } = useCompany();
    const {
        products, movements, currentDollarRate,
        loadingProducts, loadingMovements,
        loadProducts, loadMovements, loadPeriodCloses,
    } = useInventory();

    const periodo = currentPeriod();

    useEffect(() => {
        if (!companyId) return;
        loadProducts(companyId);
        loadMovements(companyId, periodo);
        loadPeriodCloses(companyId);
    }, [companyId, periodo, loadProducts, loadMovements, loadPeriodCloses]);

    // ── derived metrics ──────────────────────────────────────────────────────
    const metrics = useMemo(() => {
        const active = products.filter((p) => p.active);
        const entradas = movements.filter((m) => ENTRY_TYPES.has(m.type)).length;
        const salidas  = movements.filter((m) => EXIT_TYPES.has(m.type)).length;
        const agotados = active.filter((p) => (p.currentStock ?? 0) <= 0).length;
        const bajos    = active.filter((p) => {
            const s = p.currentStock ?? 0;
            return s > 0 && s <= LOW_STOCK_THRESHOLD;
        }).length;
        const valorBs  = active.reduce(
            (acc, p) => acc + (p.currentStock ?? 0) * (p.averageCost ?? 0),
            0,
        );
        const valorUsd = currentDollarRate && currentDollarRate > 0
            ? valorBs / currentDollarRate
            : null;
        return {
            active:    active.length,
            total:     products.length,
            entradas, salidas,
            agotados, bajos,
            critical:  agotados + bajos,
            valorBs, valorUsd,
        };
    }, [products, movements, currentDollarRate]);

    // ── low-stock snapshot (top 8 active, lowest stock first) ───────────────
    const stockAlerts = useMemo(() => (
        products
            .filter((p) => p.active && (p.currentStock ?? 0) <= LOW_STOCK_THRESHOLD)
            .sort((a, b) => (a.currentStock ?? 0) - (b.currentStock ?? 0))
            .slice(0, 8)
    ), [products]);

    const loading        = loadingProducts || loadingMovements;
    const hasInventory   = metrics.total > 0;
    const hasStockAlerts = stockAlerts.length > 0;

    return (
        <div className="flex flex-col min-h-full bg-background selection:bg-primary-500/30 font-mono">
            <PageHeader title="Inventario" subtitle={`Tablero — ${periodo}`}>
                <BaseButton.Root
                    as={Link}
                    href="/purchases/new"
                    variant="primary"
                    size="md"
                    leftIcon={<Plus size={16} strokeWidth={3} />}
                >
                    Nueva entrada
                </BaseButton.Root>
                <BaseButton.Root
                    as={Link}
                    href="/inventory/sales"
                    variant="secondary"
                    size="md"
                    leftIcon={<ArrowUpRight size={16} />}
                >
                    Nueva salida
                </BaseButton.Root>
            </PageHeader>

            <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
                {/* Operational warning: empty catalog */}
                {!loadingProducts && metrics.total === 0 && (
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
                                <span className="font-bold text-foreground">Sin productos registrados</span>
                                <span className="text-[var(--text-secondary)]">
                                    Crea el catálogo antes de registrar entradas o salidas.
                                </span>
                            </div>
                        </div>
                        <BaseButton.Root
                            as={Link}
                            href="/inventory/products"
                            variant="secondary"
                            size="sm"
                            rightIcon={<ArrowRight size={14} />}
                        >
                            Crear producto
                        </BaseButton.Root>
                    </motion.div>
                )}

                {/* KPIs */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
                    <DashboardKpiCard
                        label="Productos activos"
                        value={metrics.active}
                        sublabel={`de ${metrics.total} totales`}
                        color="primary"
                        loading={loadingProducts}
                        icon={Package}
                    />
                    <DashboardKpiCard
                        label="Valor del inventario"
                        value={`Bs. ${fmtBs(metrics.valorBs)}`}
                        sublabel={
                            metrics.valorUsd != null && currentDollarRate
                                ? `$${fmtBs(metrics.valorUsd)} USD · tasa ${fmtRate(currentDollarRate)}`
                                : "Registra un cierre con tasa para ver el equivalente USD"
                        }
                        color="default"
                        loading={loadingProducts}
                        icon={Wallet}
                        emphasis
                    />
                    <DashboardKpiCard
                        label="Movimientos del mes"
                        value={metrics.entradas + metrics.salidas}
                        sublabel={`Entradas ${metrics.entradas} · Salidas ${metrics.salidas}`}
                        color="success"
                        loading={loadingMovements}
                        icon={Activity}
                    />
                    <DashboardKpiCard
                        label="Stock crítico"
                        value={metrics.critical}
                        sublabel={`${metrics.agotados} agotados · ${metrics.bajos} en alerta (≤ ${LOW_STOCK_THRESHOLD})`}
                        color={metrics.critical > 0 ? "warning" : "default"}
                        loading={loadingProducts}
                        icon={AlertTriangle}
                        emphasis={metrics.critical > 0}
                    />
                </div>

                {/* Stock alerts panel */}
                {hasInventory && (
                    <div>
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="overflow-hidden rounded-xl border border-border-light bg-surface-1 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                        >
                            <div className="flex items-center justify-between gap-4 border-b border-border-light px-4 py-4 sm:px-5">
                                <div>
                                    <h2 className="font-sans text-[15px] font-semibold tracking-tight text-foreground">
                                        Alertas de stock
                                    </h2>
                                    <p className="mt-0.5 font-sans text-[12px] text-[var(--text-tertiary)]">
                                        {hasStockAlerts
                                            ? `Existencias por debajo de ${LOW_STOCK_THRESHOLD} unidades`
                                            : "Todos los productos tienen stock saludable"}
                                    </p>
                                </div>
                                <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                                    {stockAlerts.length} {stockAlerts.length === 1 ? "producto" : "productos"}
                                </span>
                                <BaseButton.Root
                                    as={Link}
                                    href="/inventory/products"
                                    variant="ghost"
                                    size="sm"
                                    rightIcon={<ArrowRight size={14} />}
                                >
                                    Ver catálogo
                                </BaseButton.Root>
                            </div>

                            {loading ? (
                                <div className="px-5 py-12 text-center text-[13px] text-[var(--text-tertiary)]">
                                    Cargando…
                                </div>
                            ) : !hasStockAlerts ? (
                                <div className="flex flex-col items-center justify-center px-8 py-14 gap-3 text-center">
                                    <div className="h-12 w-12 rounded-2xl bg-surface-2 flex items-center justify-center text-[var(--text-tertiary)]">
                                        <PackageX size={22} strokeWidth={1.8} />
                                    </div>
                                    <p className="text-[13px] text-[var(--text-secondary)] font-sans max-w-[340px]">
                                        Ningún producto activo está por debajo del umbral de {LOW_STOCK_THRESHOLD} unidades.
                                    </p>
                                </div>
                            ) : (
                                <>
                                {/* Mobile: card list */}
                                <div className="md:hidden flex flex-col gap-3 px-4 py-4">
                                    {stockAlerts.map((p) => {
                                        const stock   = p.currentStock ?? 0;
                                        const cost    = p.averageCost  ?? 0;
                                        const valorBs = stock * cost;
                                        const isOut   = stock <= 0;
                                        return (
                                            <BaseListCard
                                                key={p.id}
                                                title={p.code || "—"}
                                                subtitle={p.name}
                                                badge={<TipoBadge tipo={p.type} />}
                                                rows={[
                                                    {
                                                        label: "Existencia",
                                                        value: (
                                                            <>
                                                                <span className={isOut ? "text-text-error font-bold" : "text-foreground"}>
                                                                    {fmtQty(stock)}
                                                                </span>
                                                                <span className="text-[11px] text-[var(--text-tertiary)] ml-1">
                                                                    {p.measureUnit}
                                                                </span>
                                                            </>
                                                        ),
                                                        align: "right",
                                                        numeric: true,
                                                    },
                                                    {
                                                        label: "Valor (Bs.)",
                                                        value: fmtBs(valorBs),
                                                        align: "right",
                                                        numeric: true,
                                                    },
                                                ]}
                                                status={
                                                    isOut ? (
                                                        <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium badge-error border">
                                                            Agotado
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium badge-warning border">
                                                            Bajo
                                                        </span>
                                                    )
                                                }
                                                chevron={false}
                                            />
                                        );
                                    })}
                                </div>

                                {/* Desktop: dense table */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-[13px]" aria-label="Productos con stock bajo">
                                        <caption className="sr-only">Productos con stock crítico ordenados por existencia</caption>
                                        <thead>
                                            <tr className="border-b border-border-light bg-surface-2/45">
                                                {[
                                                    { label: "Código",      align: "text-left"   },
                                                    { label: "Nombre",      align: "text-left"   },
                                                    { label: "Tipo",        align: "text-left"   },
                                                    { label: "Existencia",  align: "text-right"  },
                                                    { label: "Valor (Bs.)", align: "text-right"  },
                                                    { label: "Estado",      align: "text-center" },
                                                ].map((h) => (
                                                    <th
                                                        key={h.label}
                                                        scope="col"
                                                        className={`px-5 py-3.5 ${h.align} text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]`}
                                                    >
                                                        {h.label}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-light/60">
                                            {stockAlerts.map((p) => {
                                                const stock   = p.currentStock ?? 0;
                                                const cost    = p.averageCost  ?? 0;
                                                const valorBs = stock * cost;
                                                const isOut   = stock <= 0;
                                                return (
                                                    <tr
                                                        key={p.id}
                                                        className={[
                                                            "group border-l-2 transition-colors",
                                                            isOut
                                                                ? "border-l-[var(--text-error)] bg-badge-error-bg/35 hover:bg-badge-error-bg/60"
                                                                : "border-l-[var(--text-warning)] hover:bg-surface-2/70",
                                                        ].join(" ")}
                                                    >
                                                        <td className="px-5 py-3.5 text-[var(--text-secondary)]">
                                                            {p.code || "—"}
                                                        </td>
                                                        <td className="max-w-[420px] px-5 py-3.5 text-foreground">
                                                            <span className="block truncate font-sans text-[13px] font-medium" title={p.name}>
                                                                {p.name}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3.5">
                                                            <TipoBadge tipo={p.type} />
                                                        </td>
                                                        <td className="px-5 py-3.5 text-right tabular-nums">
                                                            <span className={isOut ? "text-text-error font-bold" : "text-foreground"}>
                                                                {fmtQty(stock)}
                                                            </span>
                                                            <span className="text-[11px] text-[var(--text-tertiary)] ml-1">
                                                                {p.measureUnit}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3.5 text-right tabular-nums text-[var(--text-secondary)]">
                                                            {fmtBs(valorBs)}
                                                        </td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            {isOut ? (
                                                                <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium badge-error border">
                                                                    Agotado
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium badge-warning border">
                                                                    Bajo
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}

                {/* Quick actions */}
                <DashboardQuickActions actions={QUICK_ACTIONS} />
            </main>
        </div>
    );
}

function TipoBadge({ tipo }: { tipo: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        mercancia: { label: "Mercancía", cls: "border badge-info" },
    };
    const { label, cls } = map[tipo] ?? {
        label: tipo,
        cls:   "bg-surface-2 text-text-secondary border border-border-light",
    };
    return (
        <span className={`inline-flex px-1.5 py-0.5 rounded text-[12px] uppercase tracking-[0.08em] font-medium ${cls}`}>
            {label}
        </span>
    );
}
