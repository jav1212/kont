"use client";

// ISLR Art. 177 report page.
// Shows per-product movement history for the monthly ISLR inventory registry.

import { useEffect, useState, useMemo } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { IslrProduct, IslrMovement } from "@/src/modules/inventory/backend/domain/islr-report";

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
    entrada:    "Entrada / Compra",
    entrada_produccion:"Entrada / Producción",
    salida:      "Salida / Venta",
    salida_produccion: "Salida / Producción",
    ajuste_positivo:   "Ajuste Positivo",
    ajuste_negativo:   "Ajuste Negativo",
    devolucion_entrada: "Devolución / Compra",
    devolucion_salida:  "Devolución / Venta",
    autoconsumo:       "Autoconsumo",
};

function exportCSV(products: IslrProduct[], period: string) {
    const lines: string[] = [];
    const sep = ",";

    const headers = [
        "Producto", "Código", "Fecha", "Referencia", "Tipo Movimiento",
        "Cant. Entrada", "Cant. Salida", "Saldo Cant.", "Costo Entrada", "Costo Salida", "Saldo Costo",
    ];
    lines.push(headers.join(sep));

    for (const p of products) {
        // Opening balance row
        lines.push([
            `"${p.productName}"`, `"${p.productCode}"`,
            "", `"Saldo Inicial"`, "",
            "", "", fmtQ(p.openingQuantity),
            "", "", fmtN(p.openingCost),
        ].join(sep));

        for (const m of p.movements) {
            lines.push([
                `"${p.productName}"`, `"${p.productCode}"`,
                m.date, `"${m.reference}"`, `"${TIPO_LABEL[m.type] ?? m.type}"`,
                m.inboundQuantity > 0 ? fmtQ(m.inboundQuantity) : "",
                m.outboundQuantity > 0 ? fmtQ(m.outboundQuantity) : "",
                fmtQ(m.balanceQuantity),
                m.inboundCost > 0 ? fmtN(m.inboundCost) : "",
                m.outboundCost > 0 ? fmtN(m.outboundCost) : "",
                fmtN(m.balanceCost),
            ].join(sep));
        }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-islr-art177-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── sub-component: ProductTable ───────────────────────────────────────────────

function ProductTable({ product }: { product: IslrProduct }) {
    const totalInbound     = product.movements.reduce((s, m) => s + m.inboundQuantity, 0);
    const totalOutbound    = product.movements.reduce((s, m) => s + m.outboundQuantity, 0);
    const totalInboundCost = product.movements.reduce((s, m) => s + m.inboundCost, 0);
    const totalOutboundCost = product.movements.reduce((s, m) => s + m.outboundCost, 0);
    const last             = product.movements[product.movements.length - 1];

    return (
        <div className="mb-6 rounded-xl border border-border-light bg-surface-1 overflow-hidden">
            {/* Product header */}
            <div className="px-4 py-2.5 border-b border-border-light bg-surface-2 flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground">
                    {product.productCode}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)]">
                    {product.productName}
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
                            <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtQ(product.openingQuantity)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--text-tertiary)]">—</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--text-tertiary)]">—</td>
                            <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtN(product.openingCost)}</td>
                        </tr>

                        {/* Movement rows */}
                        {product.movements.map((m: IslrMovement) => (
                            <tr key={m.id} className="border-b border-border-light/40 hover:bg-surface-2 transition-colors">
                                <td className="px-3 py-2 text-[var(--text-secondary)]">{m.date}</td>
                                <td className="px-3 py-2 text-[var(--text-secondary)] max-w-[130px] truncate" title={m.reference}>
                                    {m.reference || "—"}
                                </td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">{TIPO_LABEL[m.type] ?? m.type}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                    {m.inboundQuantity > 0 ? fmtQ(m.inboundQuantity) : <span className="text-[var(--text-tertiary)]">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                    {m.outboundQuantity > 0 ? fmtQ(m.outboundQuantity) : <span className="text-[var(--text-tertiary)]">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{fmtQ(m.balanceQuantity)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                    {m.inboundCost > 0 ? fmtN(m.inboundCost) : <span className="text-[var(--text-tertiary)]">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                    {m.outboundCost > 0 ? fmtN(m.outboundCost) : <span className="text-[var(--text-tertiary)]">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{fmtN(m.balanceCost)}</td>
                            </tr>
                        ))}

                        {/* Product subtotals */}
                        <tr className="border-t-2 border-primary-500/20 bg-primary-500/[0.03]">
                            <td className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] font-bold text-foreground" colSpan={3}>
                                Subtotal
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">{fmtQ(totalInbound)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">{fmtQ(totalOutbound)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">
                                {last ? fmtQ(last.balanceQuantity) : fmtQ(product.openingQuantity)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">{fmtN(totalInboundCost)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">{fmtN(totalOutboundCost)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[10px] font-bold text-foreground">
                                {last ? fmtN(last.balanceCost) : fmtN(product.openingCost)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function IslrReportPage() {
    const { companyId } = useCompany();
    const { islrReport, loadingIslrReport, error, setError, loadIslrReport } = useInventory();

    const [period, setPeriod] = useState(currentPeriod());
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        if (companyId && !searched) {
            loadIslrReport(companyId, period);
            setSearched(true);
        }
    }, [companyId, period, loadIslrReport, searched]);

    function handleSearch() {
        if (!companyId) return;
        setError(null);
        loadIslrReport(companyId, period);
    }

    const grandTotal = useMemo(() => {
        let inboundQty = 0, outboundQty = 0, inboundCost = 0, outboundCost = 0;
        let balanceQty = 0, balanceCost = 0;
        for (const p of islrReport) {
            inboundQty   += p.movements.reduce((s, m) => s + m.inboundQuantity, 0);
            outboundQty  += p.movements.reduce((s, m) => s + m.outboundQuantity, 0);
            inboundCost  += p.movements.reduce((s, m) => s + m.inboundCost, 0);
            outboundCost += p.movements.reduce((s, m) => s + m.outboundCost, 0);
            const last = p.movements[p.movements.length - 1];
            balanceQty  += last ? last.balanceQuantity : p.openingQuantity;
            balanceCost += last ? last.balanceCost     : p.openingCost;
        }
        return { inboundQty, outboundQty, inboundCost, outboundCost, balanceQty, balanceCost };
    }, [islrReport]);

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
                                value={period}
                                onChange={(e) => { setPeriod(e.target.value); setSearched(false); }}
                                className="h-8 px-2 rounded-lg border border-border-light bg-surface-1 text-[12px] text-foreground outline-none focus:border-primary-500/60"
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={loadingIslrReport}
                            className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            {loadingIslrReport ? "Cargando…" : "Generar"}
                        </button>
                        {islrReport.length > 0 && (
                            <>
                                <button
                                    onClick={() => exportCSV(islrReport, period)}
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

                {loadingIslrReport ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">
                        Cargando reporte ISLR…
                    </div>
                ) : islrReport.length === 0 ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">
                        No hay movimientos para el período seleccionado.
                    </div>
                ) : (
                    <>
                        {/* Per-product tables */}
                        {islrReport.map((p) => (
                            <ProductTable key={p.productId} product={p} />
                        ))}

                        {/* Grand total */}
                        <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-[10px] whitespace-nowrap">
                                    <tbody>
                                        <tr className="bg-primary-500/[0.06]">
                                            <td className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] font-bold text-foreground" colSpan={3}>
                                                Gran Total ({islrReport.length} producto{islrReport.length !== 1 ? "s" : ""})
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-foreground min-w-[90px]">
                                                {fmtQ(grandTotal.inboundQty)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-foreground min-w-[90px]">
                                                {fmtQ(grandTotal.outboundQty)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-foreground min-w-[90px]">
                                                {fmtQ(grandTotal.balanceQty)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-foreground min-w-[110px]">
                                                {fmtN(grandTotal.inboundCost)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-foreground min-w-[110px]">
                                                {fmtN(grandTotal.outboundCost)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[11px] font-bold text-primary-500 min-w-[110px]">
                                                {fmtN(grandTotal.balanceCost)} Bs.
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
