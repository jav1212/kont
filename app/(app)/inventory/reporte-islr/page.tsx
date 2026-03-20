"use client";

import { useEffect, useState, useMemo } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { ReporteISLRProducto, ReporteISLRMovimiento } from "@/src/modules/inventory/frontend/hooks/use-inventory";

// ── helpers ──────────────────────────────────────────────────────────────────

function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtN(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQ(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

const TIPO_LABEL: Record<string, string> = {
    entrada_compra:    "Entrada / Compra",
    entrada_produccion:"Entrada / Producción",
    salida_venta:      "Salida / Venta",
    salida_produccion: "Salida / Producción",
    ajuste_positivo:   "Ajuste Positivo",
    ajuste_negativo:   "Ajuste Negativo",
    devolucion_compra: "Devolución / Compra",
    devolucion_venta:  "Devolución / Venta",
    autoconsumo:       "Autoconsumo",
};

function exportCSV(productos: ReporteISLRProducto[], periodo: string) {
    const lines: string[] = [];
    const sep = ",";

    const headers = [
        "Producto", "Código", "Fecha", "Referencia", "Tipo Movimiento",
        "Cant. Entrada", "Cant. Salida", "Saldo Cant.", "Costo Entrada", "Costo Salida", "Saldo Costo",
    ];
    lines.push(headers.join(sep));

    for (const p of productos) {
        // Opening balance row
        lines.push([
            `"${p.productoNombre}"`, `"${p.productoCodigo}"`,
            "", `"Saldo Inicial"`, "",
            "", "", fmtQ(p.aperturaCantidad),
            "", "", fmtN(p.aperturaCosto),
        ].join(sep));

        for (const m of p.movimientos) {
            lines.push([
                `"${p.productoNombre}"`, `"${p.productoCodigo}"`,
                m.fecha, `"${m.referencia}"`, `"${TIPO_LABEL[m.tipo] ?? m.tipo}"`,
                m.cantEntrada > 0 ? fmtQ(m.cantEntrada) : "",
                m.cantSalida  > 0 ? fmtQ(m.cantSalida)  : "",
                fmtQ(m.saldoCantidad),
                m.costoEntrada > 0 ? fmtN(m.costoEntrada) : "",
                m.costoSalida  > 0 ? fmtN(m.costoSalida)  : "",
                fmtN(m.saldoCosto),
            ].join(sep));
        }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-islr-art177-${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── sub-component: ProductTable ───────────────────────────────────────────────

function ProductTable({ producto }: { producto: ReporteISLRProducto }) {
    const totalEntrada  = producto.movimientos.reduce((s, m) => s + m.cantEntrada, 0);
    const totalSalida   = producto.movimientos.reduce((s, m) => s + m.cantSalida, 0);
    const totalCostoEnt = producto.movimientos.reduce((s, m) => s + m.costoEntrada, 0);
    const totalCostoSal = producto.movimientos.reduce((s, m) => s + m.costoSalida, 0);
    const last          = producto.movimientos[producto.movimientos.length - 1];

    return (
        <div className="mb-6 rounded-xl border border-border-light bg-surface-1 overflow-hidden">
            {/* Product header */}
            <div className="px-4 py-2.5 border-b border-border-light bg-surface-2 flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground">
                    {producto.productoCodigo}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)]">
                    {producto.productoNombre}
                </span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-[10px] whitespace-nowrap">
                    <thead>
                        <tr className="border-b border-border-light">
                            <th className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[90px]">Fecha</th>
                            <th className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[110px]">Referencia</th>
                            <th className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[150px]">Tipo Movimiento</th>
                            <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[90px]">Cant. Entrada</th>
                            <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[90px]">Cant. Salida</th>
                            <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[90px]">Saldo Cant.</th>
                            <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[110px]">Costo Entrada</th>
                            <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[110px]">Costo Salida</th>
                            <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[110px]">Saldo Costo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Opening balance row */}
                        <tr className="border-b border-border-light/50 bg-surface-2/60">
                            <td className="px-3 py-2 text-[var(--text-tertiary)]">—</td>
                            <td className="px-3 py-2 font-medium text-[var(--text-secondary)] uppercase tracking-[0.1em] text-[9px]">Saldo Inicial</td>
                            <td className="px-3 py-2 text-[var(--text-tertiary)]">—</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--text-tertiary)]">—</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--text-tertiary)]">—</td>
                            <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtQ(producto.aperturaCantidad)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--text-tertiary)]">—</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--text-tertiary)]">—</td>
                            <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtN(producto.aperturaCosto)}</td>
                        </tr>

                        {/* Movement rows */}
                        {producto.movimientos.map((m) => (
                            <tr key={m.id} className="border-b border-border-light/40 hover:bg-surface-2 transition-colors">
                                <td className="px-3 py-2 text-[var(--text-secondary)]">{m.fecha}</td>
                                <td className="px-3 py-2 text-[var(--text-secondary)] max-w-[130px] truncate" title={m.referencia}>
                                    {m.referencia || "—"}
                                </td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">{TIPO_LABEL[m.tipo] ?? m.tipo}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                    {m.cantEntrada > 0 ? fmtQ(m.cantEntrada) : <span className="text-[var(--text-tertiary)]">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                    {m.cantSalida > 0 ? fmtQ(m.cantSalida) : <span className="text-[var(--text-tertiary)]">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{fmtQ(m.saldoCantidad)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                    {m.costoEntrada > 0 ? fmtN(m.costoEntrada) : <span className="text-[var(--text-tertiary)]">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                    {m.costoSalida > 0 ? fmtN(m.costoSalida) : <span className="text-[var(--text-tertiary)]">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{fmtN(m.saldoCosto)}</td>
                            </tr>
                        ))}

                        {/* Product subtotals */}
                        <tr className="border-t-2 border-primary-500/20 bg-primary-500/[0.03]">
                            <td className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] font-bold text-foreground" colSpan={3}>
                                Subtotal
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">{fmtQ(totalEntrada)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">{fmtQ(totalSalida)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">
                                {last ? fmtQ(last.saldoCantidad) : fmtQ(producto.aperturaCantidad)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">{fmtN(totalCostoEnt)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">{fmtN(totalCostoSal)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">
                                {last ? fmtN(last.saldoCosto) : fmtN(producto.aperturaCosto)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ReporteISLRPage() {
    const { companyId } = useCompany();
    const { reporteISLR, loadingReporteISLR, error, setError, loadReporteISLR } = useInventory();

    const [periodo, setPeriodo] = useState(currentPeriod());
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        if (companyId && !searched) {
            loadReporteISLR(companyId, periodo);
            setSearched(true);
        }
    }, [companyId, periodo, loadReporteISLR, searched]);

    function handleSearch() {
        if (!companyId) return;
        setError(null);
        loadReporteISLR(companyId, periodo);
    }

    const grandTotal = useMemo(() => {
        let cantEntrada = 0, cantSalida = 0, costoEntrada = 0, costoSalida = 0;
        let saldoCantidad = 0, saldoCosto = 0;
        for (const p of reporteISLR) {
            cantEntrada  += p.movimientos.reduce((s, m) => s + m.cantEntrada, 0);
            cantSalida   += p.movimientos.reduce((s, m) => s + m.cantSalida, 0);
            costoEntrada += p.movimientos.reduce((s, m) => s + m.costoEntrada, 0);
            costoSalida  += p.movimientos.reduce((s, m) => s + m.costoSalida, 0);
            const last = p.movimientos[p.movimientos.length - 1];
            saldoCantidad += last ? last.saldoCantidad : p.aperturaCantidad;
            saldoCosto    += last ? last.saldoCosto    : p.aperturaCosto;
        }
        return { cantEntrada, cantSalida, costoEntrada, costoSalida, saldoCantidad, saldoCosto };
    }, [reporteISLR]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Reporte Art. 177 ISLR
                        </h1>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.16em] mt-0.5">
                            Reglamento ISLR Art. 177 — Registro mensual por producto
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                                Período
                            </label>
                            <input
                                type="month"
                                value={periodo}
                                onChange={(e) => { setPeriodo(e.target.value); setSearched(false); }}
                                className="h-8 px-2 rounded-lg border border-border-light bg-surface-1 text-[12px] text-foreground outline-none focus:border-primary-500/60"
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={loadingReporteISLR}
                            className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            {loadingReporteISLR ? "Cargando…" : "Generar"}
                        </button>
                        {reporteISLR.length > 0 && (
                            <>
                                <button
                                    onClick={() => exportCSV(reporteISLR, periodo)}
                                    className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                                >
                                    Exportar CSV
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                                >
                                    Imprimir
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="px-8 py-6">
                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
                    </div>
                )}

                {loadingReporteISLR ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">
                        Cargando reporte ISLR…
                    </div>
                ) : reporteISLR.length === 0 ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">
                        No hay movimientos para el período seleccionado.
                    </div>
                ) : (
                    <>
                        {/* Per-product tables */}
                        {reporteISLR.map((p) => (
                            <ProductTable key={p.productoId} producto={p} />
                        ))}

                        {/* Grand total */}
                        <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-[10px] whitespace-nowrap">
                                    <tbody>
                                        <tr className="bg-primary-500/[0.06]">
                                            <td className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] font-bold text-foreground" colSpan={3}>
                                                Gran Total ({reporteISLR.length} producto{reporteISLR.length !== 1 ? "s" : ""})
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-foreground min-w-[90px]">
                                                {fmtQ(grandTotal.cantEntrada)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-foreground min-w-[90px]">
                                                {fmtQ(grandTotal.cantSalida)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-foreground min-w-[90px]">
                                                {fmtQ(grandTotal.saldoCantidad)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-foreground min-w-[110px]">
                                                {fmtN(grandTotal.costoEntrada)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-foreground min-w-[110px]">
                                                {fmtN(grandTotal.costoSalida)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-primary-500 min-w-[110px]">
                                                {fmtN(grandTotal.saldoCosto)} Bs.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
