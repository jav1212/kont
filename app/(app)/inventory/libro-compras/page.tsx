"use client";

import { useEffect, useState, useMemo } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { LibroComprasRow } from "@/src/modules/inventory/backend/domain/libro-compras";

// ── helpers ──────────────────────────────────────────────────────────────────

function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtN(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sum(rows: LibroComprasRow[], key: keyof LibroComprasRow): number {
    return rows.reduce((acc, r) => acc + (r[key] as number), 0);
}

function exportCSV(rows: LibroComprasRow[], periodo: string) {
    const headers = [
        "Fecha", "N° Factura", "N° Control", "RIF Proveedor", "Proveedor",
        "Base Gravada", "IVA 16%", "Base Exenta", "Total",
    ];
    const lines = [
        headers.join(","),
        ...rows.map((r) => [
            r.fecha,
            `"${r.numeroFactura}"`,
            `"${r.numeroControl}"`,
            `"${r.proveedorRif}"`,
            `"${r.proveedorNombre}"`,
            r.baseGravada,
            r.ivaGeneral,
            r.baseExenta,
            r.total,
        ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `libro-compras-${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function LibroComprasPage() {
    const { companyId } = useCompany();
    const { libroCompras, loadingLibroCompras, error, setError, loadLibroCompras } = useInventory();

    const [periodo, setPeriodo] = useState(currentPeriod());
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        if (companyId && !searched) {
            loadLibroCompras(companyId, periodo);
            setSearched(true);
        }
    }, [companyId, periodo, loadLibroCompras, searched]);

    function handleSearch() {
        if (!companyId) return;
        setError(null);
        loadLibroCompras(companyId, periodo);
    }

    const totales = useMemo(() => ({
        baseGravada: sum(libroCompras, "baseGravada"),
        ivaGeneral:  sum(libroCompras, "ivaGeneral"),
        baseExenta:  sum(libroCompras, "baseExenta"),
        total:       sum(libroCompras, "total"),
    }), [libroCompras]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Libro de Compras IVA
                        </h1>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.16em] mt-0.5">
                            Reglamento Ley IVA Art. 70–72
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
                            disabled={loadingLibroCompras}
                            className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            {loadingLibroCompras ? "Cargando…" : "Generar"}
                        </button>
                        {libroCompras.length > 0 && (
                            <button
                                onClick={() => exportCSV(libroCompras, periodo)}
                                className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Exportar CSV
                            </button>
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

                {loadingLibroCompras ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">Cargando libro de compras…</div>
                ) : libroCompras.length === 0 ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">
                        No hay facturas confirmadas para el período seleccionado.
                    </div>
                ) : (
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-[10px] whitespace-nowrap">
                                <thead>
                                    <tr className="border-b border-border-light bg-surface-2">
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[90px]">
                                            Fecha
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[120px]">
                                            N° Factura
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[120px]">
                                            N° Control
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[110px]">
                                            RIF Proveedor
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[160px]">
                                            Proveedor
                                        </th>
                                        <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[110px]">
                                            Base Gravada
                                        </th>
                                        <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[90px]">
                                            IVA 16%
                                        </th>
                                        <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[100px]">
                                            Base Exenta
                                        </th>
                                        <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[110px]">
                                            Total
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {libroCompras.map((row) => (
                                        <tr key={row.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-3 py-2 text-[var(--text-secondary)]">{row.fecha}</td>
                                            <td className="px-3 py-2 text-foreground">{row.numeroFactura || "—"}</td>
                                            <td className="px-3 py-2 text-[var(--text-secondary)]">{row.numeroControl || "—"}</td>
                                            <td className="px-3 py-2 text-[var(--text-secondary)]">{row.proveedorRif || "—"}</td>
                                            <td className="px-3 py-2 text-foreground max-w-[180px] truncate" title={row.proveedorNombre}>
                                                {row.proveedorNombre}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums text-right text-[var(--text-primary)]">
                                                {fmtN(row.baseGravada)}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums text-right text-[var(--text-primary)]">
                                                {fmtN(row.ivaGeneral)}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                {fmtN(row.baseExenta)}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums text-right font-medium text-foreground">
                                                {fmtN(row.total)}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Totales mensuales */}
                                    <tr className="border-t-2 border-primary-500/30 bg-primary-500/[0.04]">
                                        <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.14em] font-bold text-foreground" colSpan={5}>
                                            Total del período
                                        </td>
                                        <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                            {fmtN(totales.baseGravada)}
                                        </td>
                                        <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                            {fmtN(totales.ivaGeneral)}
                                        </td>
                                        <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                            {fmtN(totales.baseExenta)}
                                        </td>
                                        <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                            {fmtN(totales.total)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Resumen crédito fiscal */}
                        <div className="px-4 py-3 border-t border-border-light bg-surface-2 flex items-center gap-6">
                            <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-medium">
                                Crédito fiscal del período:
                            </span>
                            <span className="text-[13px] font-bold tabular-nums text-primary-500">
                                {fmtN(totales.ivaGeneral)} Bs.
                            </span>
                            <span className="text-[9px] text-[var(--text-tertiary)]">
                                ({libroCompras.length} {libroCompras.length === 1 ? "factura" : "facturas"} confirmadas)
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
