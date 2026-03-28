"use client";

// Annual inventory ledger page (Libro de Inventarios).
// Displays annual inventory movements per product and computes ISLR Art. 177 cost of sales.

import { useEffect, useRef, useState, useMemo } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { InventoryLedgerRow } from "@/src/modules/inventory/backend/domain/inventory-ledger";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtN(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQ(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function sum(rows: InventoryLedgerRow[], key: keyof InventoryLedgerRow): number {
    return rows.reduce((acc, r) => acc + Number(r[key]), 0);
}

function exportCSV(rows: InventoryLedgerRow[], year: number) {
    const headers = [
        "Código", "Producto", "Tipo", "Unidad",
        "Cant. Inicial", "Valor Inicial",
        "Cant. Entradas", "Valor Entradas",
        "Cant. Salidas", "Valor Salidas",
        "Cant. Final", "Valor Final",
        "Valor Compras",
    ];
    const lines = [
        headers.join(","),
        ...rows.map((r) => [
            `"${r.code}"`,
            `"${r.name}"`,
            `"${r.type}"`,
            `"${r.measureUnit}"`,
            r.openingQuantity,
            r.openingValue,
            r.inboundQuantity,
            r.inboundValue,
            r.outboundQuantity,
            r.outboundValue,
            r.closingQuantity,
            r.closingValue,
            r.purchasesValue,
        ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `libro-inventarios-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function LibroInventariosPage() {
    const { companyId } = useCompany();
    const {
        inventoryLedger, loadingInventoryLedger, error, setError, loadInventoryLedger,
    } = useInventory();

    const [year, setYear] = useState(new Date().getFullYear());
    const searchedRef = useRef(false);

    useEffect(() => {
        if (companyId && !searchedRef.current) {
            searchedRef.current = true;
            loadInventoryLedger(companyId, year);
        }
    }, [companyId, year, loadInventoryLedger]);

    function handleSearch() {
        if (!companyId) return;
        setError(null);
        loadInventoryLedger(companyId, year);
    }

    const totals = useMemo(() => ({
        openingValue:  sum(inventoryLedger, "openingValue"),
        inboundValue:  sum(inventoryLedger, "inboundValue"),
        outboundValue: sum(inventoryLedger, "outboundValue"),
        closingValue:  sum(inventoryLedger, "closingValue"),
        purchasesValue: sum(inventoryLedger, "purchasesValue"),
    }), [inventoryLedger]);

    // ISLR Art. 177 formula: Costo Ventas = Inv. Inicial + Compras − Inv. Final
    const costoVentas = totals.openingValue + totals.purchasesValue - totals.closingValue;

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Libro de Inventarios Anual" subtitle="Código de Comercio Art. 36 — Inventario anual al cierre del ejercicio">
                <div className="flex items-center gap-2">
                    <label className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                        Año
                    </label>
                    <input
                        type="number"
                        min={2000}
                        max={2100}
                        value={year}
                        onChange={(e) => { searchedRef.current = false; setYear(Number(e.target.value)); }}
                        className="h-8 w-24 px-2 rounded-lg border border-border-light bg-surface-1 text-[12px] text-foreground outline-none focus:border-primary-500/60"
                    />
                </div>
                <BaseButton.Root
                    variant="primary"
                    size="sm"
                    onClick={handleSearch}
                    disabled={loadingInventoryLedger}
                >
                    {loadingInventoryLedger ? "Cargando…" : "Generar"}
                </BaseButton.Root>
                {inventoryLedger.length > 0 && (
                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={() => exportCSV(inventoryLedger, year)}
                    >
                        Exportar CSV
                    </BaseButton.Root>
                )}
                {inventoryLedger.length > 0 && (
                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={() => window.print()}
                    >
                        Imprimir
                    </BaseButton.Root>
                )}
            </PageHeader>

            <div className="px-8 py-6">
                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
                    </div>
                )}

                {loadingInventoryLedger ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">Cargando libro de inventarios…</div>
                ) : inventoryLedger.length === 0 ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">
                        No hay movimientos de inventario para el año seleccionado.
                    </div>
                ) : (
                    <>
                        {/* Main table */}
                        <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden mb-6">
                            <div className="overflow-x-auto">
                                <table className="w-full text-[10px] whitespace-nowrap">
                                    <thead>
                                        <tr className="border-b border-border-light bg-surface-2">
                                            <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Código</th>
                                            <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[160px]">Producto</th>
                                            <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Tipo</th>
                                            <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[60px]">Unidad</th>
                                            <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Cant. Ini.</th>
                                            <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[100px]">Valor Ini.</th>
                                            <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Entradas</th>
                                            <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[100px]">Valor Ent.</th>
                                            <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Salidas</th>
                                            <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[100px]">Valor Sal.</th>
                                            <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Cant. Fin.</th>
                                            <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[110px]">Valor Final</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inventoryLedger.map((row) => (
                                            <tr key={row.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                <td className="px-3 py-2 text-[var(--text-secondary)]">{row.code || "—"}</td>
                                                <td className="px-3 py-2 text-foreground max-w-[200px] truncate" title={row.name}>{row.name}</td>
                                                <td className="px-3 py-2 text-[var(--text-secondary)] capitalize">{row.type}</td>
                                                <td className="px-3 py-2 text-[var(--text-secondary)]">{row.measureUnit}</td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.openingQuantity > 0 ? fmtQ(row.openingQuantity) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.openingValue > 0 ? fmtN(row.openingValue) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.inboundQuantity > 0 ? fmtQ(row.inboundQuantity) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.inboundValue > 0 ? fmtN(row.inboundValue) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.outboundQuantity > 0 ? fmtQ(row.outboundQuantity) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.outboundValue > 0 ? fmtN(row.outboundValue) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {fmtQ(row.closingQuantity)}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right font-medium text-foreground">
                                                    {fmtN(row.closingValue)}
                                                </td>
                                            </tr>
                                        ))}

                                        {/* Totals row */}
                                        <tr className="border-t-2 border-primary-500/30 bg-primary-500/[0.04]">
                                            <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.14em] font-bold text-foreground" colSpan={4}>
                                                Total
                                            </td>
                                            <td className="px-3 py-2.5" />
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                                {fmtN(totals.openingValue)}
                                            </td>
                                            <td className="px-3 py-2.5" />
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                                {fmtN(totals.inboundValue)}
                                            </td>
                                            <td className="px-3 py-2.5" />
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                                {fmtN(totals.outboundValue)}
                                            </td>
                                            <td className="px-3 py-2.5" />
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                                {fmtN(totals.closingValue)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* ISLR summary panel */}
                        <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                            <div className="px-5 py-3 border-b border-border-light bg-surface-2">
                                <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-medium">
                                    Resumen ISLR Art. 177 — Costo de Ventas
                                </span>
                            </div>
                            <div className="px-5 py-4 flex flex-col gap-2 text-[11px]">
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[10px]">
                                        Inventario inicial (01/01/{year})
                                    </span>
                                    <span className="tabular-nums font-medium text-foreground">
                                        {fmtN(totals.openingValue)} Bs.
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[10px]">
                                        + Compras del año
                                    </span>
                                    <span className="tabular-nums font-medium text-foreground">
                                        {fmtN(totals.purchasesValue)} Bs.
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[10px]">
                                        − Inventario final (31/12/{year})
                                    </span>
                                    <span className="tabular-nums font-medium text-foreground">
                                        {fmtN(totals.closingValue)} Bs.
                                    </span>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-border-light">
                                    <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-foreground">
                                        = Costo de Ventas
                                    </span>
                                    <span className="text-[15px] font-bold tabular-nums text-primary-500">
                                        {fmtN(costoVentas)} Bs.
                                    </span>
                                </div>
                                <p className="text-[9px] text-[var(--text-tertiary)] mt-1">
                                    ({inventoryLedger.length} {inventoryLedger.length === 1 ? "producto" : "productos"} con movimientos en {year})
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
