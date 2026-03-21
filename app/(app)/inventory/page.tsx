"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtN(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── component ────────────────────────────────────────────────────────────────

export default function InventoryDashboard() {
    const { companyId } = useCompany();
    const {
        productos, movimientos,
        loadingProductos, loadingMovimientos,
        loadProductos, loadMovimientos,
    } = useInventory();

    const periodo = currentPeriod();

    useEffect(() => {
        if (!companyId) return;
        loadProductos(companyId);
        loadMovimientos(companyId, periodo);
    }, [companyId, periodo, loadProductos, loadMovimientos]);

    const kpis = useMemo(() => {
        const activos = productos.filter((p) => p.activo).length;
        const entradas = movimientos.filter((m) =>
            ["entrada_compra", "entrada_produccion", "devolucion_compra", "ajuste_positivo"].includes(m.tipo)
        ).length;
        const salidas = movimientos.filter((m) =>
            ["salida_venta", "salida_produccion", "devolucion_venta", "ajuste_negativo"].includes(m.tipo)
        ).length;
        const bajoMinimo = productos.filter(
            (p) => p.activo && p.existenciaActual <= p.existenciaMinima
        ).length;
        return { activos, entradas, salidas, bajoMinimo };
    }, [productos, movimientos]);

    const loading = loadingProductos || loadingMovimientos;

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Inventario
                        </h1>
                        <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] mt-0.5">
                            Dashboard — {periodo}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/inventory/compras/nueva"
                            className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[12px] uppercase tracking-[0.12em] flex items-center gap-1.5 transition-colors"
                        >
                            + Compra
                        </Link>
                        <Link
                            href="/inventory/ventas"
                            className="h-9 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[12px] uppercase tracking-[0.12em] flex items-center gap-1.5 transition-colors"
                        >
                            + Venta
                        </Link>
                    </div>
                </div>
            </div>

            <div className="px-8 py-6 space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-4 gap-4">
                    {[
                        { label: "Productos activos",   value: loading ? "…" : kpis.activos,    color: "text-primary-500" },
                        { label: "Entradas del mes",     value: loading ? "…" : kpis.entradas,  color: "text-green-500"   },
                        { label: "Salidas del mes",      value: loading ? "…" : kpis.salidas,   color: "text-red-500"     },
                        { label: "Bajo mínimo",          value: loading ? "…" : kpis.bajoMinimo, color: kpis.bajoMinimo > 0 ? "text-amber-500" : "text-[var(--text-tertiary)]" },
                    ].map((kpi) => (
                        <div key={kpi.label} className="rounded-xl border border-border-light bg-surface-1 px-5 py-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-2">{kpi.label}</p>
                            <p className={`text-[24px] font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
                        </div>
                    ))}
                </div>

                {/* Productos table */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                            Productos
                        </p>
                        <Link
                            href="/inventory/productos"
                            className="text-[12px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors"
                        >
                            Ver todos →
                        </Link>
                    </div>

                    {loading ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : productos.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                            No hay productos.{" "}
                            <Link href="/inventory/productos" className="text-primary-500 underline">
                                Crear uno
                            </Link>
                        </div>
                    ) : (
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-border-light">
                                    {["Código", "Nombre", "Tipo", "Existencia", "Mínimo", "Estado"].map((h) => (
                                        <th key={h} className="px-4 py-2.5 text-left text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {productos.slice(0, 20).map((p) => {
                                    const bajoMin = p.existenciaActual <= p.existenciaMinima;
                                    return (
                                        <tr key={p.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.codigo || "—"}</td>
                                            <td className="px-4 py-2.5 text-foreground font-medium">{p.nombre}</td>
                                            <td className="px-4 py-2.5">
                                                <TipoBadge tipo={p.tipo} />
                                            </td>
                                            <td className={`px-4 py-2.5 tabular-nums ${bajoMin ? "text-amber-500 font-bold" : "text-foreground"}`}>
                                                {fmtN(p.existenciaActual)} {p.unidadMedida}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">
                                                {fmtN(p.existenciaMinima)}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {p.activo ? (
                                                    <span className="text-text-success text-[11px] uppercase tracking-[0.10em]">Activo</span>
                                                ) : (
                                                    <span className="text-text-tertiary text-[11px] uppercase tracking-[0.10em]">Inactivo</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Quick links */}
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { href: "/inventory/produccion",  label: "Producción",      desc: "Transformaciones y lotes"       },
                        { href: "/inventory/movimientos", label: "Ajustes / Devol.", desc: "Correcciones y devoluciones"   },
                        { href: "/inventory/kardex",      label: "Kardex",           desc: "Historial por producto"        },
                    ].map((q) => (
                        <Link
                            key={q.href}
                            href={q.href}
                            className="rounded-xl border border-border-light bg-surface-1 px-5 py-4 hover:bg-surface-2 transition-colors group"
                        >
                            <p className="text-[13px] font-medium text-foreground group-hover:text-primary-500 transition-colors">
                                {q.label}
                            </p>
                            <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">{q.desc}</p>
                        </Link>
                    ))}
                </div>
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
        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium ${cls}`}>
            {label}
        </span>
    );
}
