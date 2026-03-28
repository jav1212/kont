"use client";

// Kardex page: displays the full movement history for a selected product.
// Supports PDF export of the kardex table.

import { useEffect, useState } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { MovementType } from "@/src/modules/inventory/backend/domain/movement";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

function isEntrada(tipo: MovementType): boolean {
    return ["entrada","entrada_produccion","devolucion_entrada","ajuste_positivo"].includes(tipo);
}

function tipoBadgeClass(tipo: MovementType): string {
    return isEntrada(tipo)
        ? "border badge-success"
        : "border badge-error";
}

// ── component ─────────────────────────────────────────────────────────────────

export default function KardexPage() {
    const { companyId } = useCompany();
    const {
        products, kardex,
        loadingProducts, loadingKardex,
        loadProducts, loadKardex,
    } = useInventory();

    const [selectedProductId, setSelectedProductId] = useState("");
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        if (companyId) loadProducts(companyId);
    }, [companyId, loadProducts]);

    async function handleSearch() {
        if (!companyId || !selectedProductId) return;
        await loadKardex(companyId, selectedProductId);
        setSearched(true);
    }

    const product = products.find((p) => p.id === selectedProductId);

    const totalEntradas = kardex
        .filter((e) => isEntrada(e.type))
        .reduce((s, e) => s + e.quantity, 0);
    const totalSalidas = kardex
        .filter((e) => !isEntrada(e.type))
        .reduce((s, e) => s + e.quantity, 0);

    function exportPdf() {
        if (!product) return;
        const rows = kardex.map((e) => {
            const entrada = isEntrada(e.type) ? fmtN(e.quantity) : "";
            const salida  = !isEntrada(e.type) ? fmtN(e.quantity) : "";
            return `<tr>
                <td>${e.date}</td>
                <td>${e.reference || "—"}</td>
                <td>${e.type.replace(/_/g," ")}</td>
                <td style="text-align:right">${entrada}</td>
                <td style="text-align:right">${salida}</td>
                <td style="text-align:right">${fmtN(e.balanceQuantity)}</td>
                <td style="text-align:right">${fmtN(e.unitCost)}</td>
                <td style="text-align:right">${fmtN(e.totalCost)}</td>
            </tr>`;
        }).join("");

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>
            body { font-family: monospace; font-size: 11px; margin: 24px; }
            h1 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 4px; }
            p.sub { color: #888; font-size: 10px; margin: 0 0 16px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f5f5f5; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; border-bottom: 1px solid #ddd; }
            td { padding: 5px 8px; border-bottom: 1px solid #eee; }
            tfoot td { font-weight: bold; background: #f9f9f9; }
        </style>
        </head><body>
        <h1>Kardex — ${product.name}</h1>
        <p class="sub">Exportado el ${new Date().toLocaleDateString("es-VE")}</p>
        <table>
            <thead><tr>
                <th>Fecha</th><th>Referencia</th><th>Tipo</th>
                <th style="text-align:right">Entrada</th><th style="text-align:right">Salida</th>
                <th style="text-align:right">Saldo</th><th style="text-align:right">Costo U.</th>
                <th style="text-align:right">Costo Total</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>
                <td colspan="3">TOTALES</td>
                <td style="text-align:right">${fmtN(totalEntradas)}</td>
                <td style="text-align:right">${fmtN(totalSalidas)}</td>
                <td></td><td></td><td></td>
            </tr></tfoot>
        </table>
        </body></html>`;

        const win = window.open("", "_blank");
        if (!win) return;
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 300);
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Kardex" subtitle="Historial de movimientos por producto">
                {searched && kardex.length > 0 && product && (
                    <BaseButton.Root variant="secondary" size="sm" onClick={exportPdf}>
                        Exportar PDF
                    </BaseButton.Root>
                )}
            </PageHeader>

            <div className="px-8 py-6 space-y-4">
                {/* Selector */}
                <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                    <div className="flex items-end gap-4">
                        <div className="flex-1">
                            <label className={labelCls}>Producto</label>
                            <select
                                className={fieldCls}
                                value={selectedProductId}
                                onChange={(e) => { setSelectedProductId(e.target.value); setSearched(false); }}
                            >
                                <option value="">Seleccionar producto…</option>
                                {loadingProducts ? (
                                    <option disabled>Cargando…</option>
                                ) : (
                                    products.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.code ? `[${p.code}] ` : ""}{p.name}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={!selectedProductId || loadingKardex}
                            className="h-9 px-5 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            {loadingKardex ? "Cargando…" : "Ver kardex"}
                        </button>
                    </div>

                    {/* Product info */}
                    {product && (
                        <div className="mt-4 pt-4 border-t border-border-light grid grid-cols-3 gap-4">
                            {[
                                { label: "Existencia actual",  value: `${fmtN(product.currentStock)} ${product.measureUnit}` },
                                { label: "Costo promedio",     value: fmtN(product.averageCost)       },
                                { label: "Método valuación",   value: product.valuationMethod.replace("_"," ") },
                            ].map((i) => (
                                <div key={i.label}>
                                    <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] mb-0.5">{i.label}</p>
                                    <p className="text-[13px] font-medium text-foreground tabular-nums">{i.value}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Kardex table */}
                {searched && (
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        {kardex.length === 0 ? (
                            <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">
                                No hay movimientos para este producto.
                            </div>
                        ) : (
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="border-b border-border-light">
                                        {["Fecha","Referencia","Tipo","Entrada","Salida","Saldo","Costo U.","Costo Total"].map((h) => (
                                            <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {kardex.map((e) => {
                                        const entrada = isEntrada(e.type);
                                        return (
                                            <tr key={e.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{e.date}</td>
                                                <td className="px-4 py-2.5 text-[var(--text-secondary)] max-w-[100px] truncate">{e.reference || "—"}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.10em] font-medium ${tipoBadgeClass(e.type)}`}>
                                                        {e.type.replace(/_/g," ")}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums text-text-success font-medium">
                                                    {entrada ? fmtN(e.quantity) : ""}
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums text-text-error font-medium">
                                                    {!entrada ? fmtN(e.quantity) : ""}
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums text-foreground font-medium">{fmtN(e.balanceQuantity)}</td>
                                                <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">{fmtN(e.unitCost)}</td>
                                                <td className="px-4 py-2.5 tabular-nums text-foreground">{fmtN(e.totalCost)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-border-medium bg-surface-2">
                                        <td colSpan={3} className="px-4 py-2.5 text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)] font-bold">
                                            Totales
                                        </td>
                                        <td className="px-4 py-2.5 tabular-nums text-text-success font-bold">{fmtN(totalEntradas)}</td>
                                        <td className="px-4 py-2.5 tabular-nums text-text-error font-bold">{fmtN(totalSalidas)}</td>
                                        <td colSpan={3} />
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
