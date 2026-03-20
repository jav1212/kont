"use client";

import { useEffect, useState, useMemo } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { LibroInventariosRow } from "@/src/modules/inventory/backend/domain/libro-inventarios";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtN(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQ(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function sum(rows: LibroInventariosRow[], key: keyof LibroInventariosRow): number {
    return rows.reduce((acc, r) => acc + (r[key] as number), 0);
}

function exportCSV(rows: LibroInventariosRow[], anio: number) {
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
            `"${r.codigo}"`,
            `"${r.nombre}"`,
            `"${r.tipo}"`,
            `"${r.unidadMedida}"`,
            r.cantInicial,
            r.valorInicial,
            r.cantEntradas,
            r.valorEntradas,
            r.cantSalidas,
            r.valorSalidas,
            r.cantFinal,
            r.valorFinal,
            r.valorCompras,
        ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `libro-inventarios-${anio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function LibroInventariosPage() {
    const { companyId } = useCompany();
    const {
        libroInventarios, loadingLibroInventarios, error, setError, loadLibroInventarios,
    } = useInventory();

    const [anio, setAnio] = useState(new Date().getFullYear());
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        if (companyId && !searched) {
            loadLibroInventarios(companyId, anio);
            setSearched(true);
        }
    }, [companyId, anio, loadLibroInventarios, searched]);

    function handleSearch() {
        if (!companyId) return;
        setError(null);
        loadLibroInventarios(companyId, anio);
    }

    const totales = useMemo(() => ({
        valorInicial:  sum(libroInventarios, "valorInicial"),
        valorEntradas: sum(libroInventarios, "valorEntradas"),
        valorSalidas:  sum(libroInventarios, "valorSalidas"),
        valorFinal:    sum(libroInventarios, "valorFinal"),
        valorCompras:  sum(libroInventarios, "valorCompras"),
    }), [libroInventarios]);

    // ISLR Art. 177 formula: Costo Ventas = Inv. Inicial + Compras − Inv. Final
    const costoVentas = totales.valorInicial + totales.valorCompras - totales.valorFinal;

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Libro de Inventarios Anual
                        </h1>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.16em] mt-0.5">
                            Código de Comercio Art. 36 · ISLR Art. 177
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                                Año
                            </label>
                            <input
                                type="number"
                                min={2000}
                                max={2100}
                                value={anio}
                                onChange={(e) => { setAnio(Number(e.target.value)); setSearched(false); }}
                                className="h-8 w-24 px-2 rounded-lg border border-border-light bg-surface-1 text-[12px] text-foreground outline-none focus:border-primary-500/60"
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={loadingLibroInventarios}
                            className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            {loadingLibroInventarios ? "Cargando…" : "Generar"}
                        </button>
                        {libroInventarios.length > 0 && (
                            <button
                                onClick={() => exportCSV(libroInventarios, anio)}
                                className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Exportar CSV
                            </button>
                        )}
                        {libroInventarios.length > 0 && (
                            <button
                                onClick={() => window.print()}
                                className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Imprimir
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

                {loadingLibroInventarios ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">Cargando libro de inventarios…</div>
                ) : libroInventarios.length === 0 ? (
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
                                        {libroInventarios.map((row) => (
                                            <tr key={row.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                <td className="px-3 py-2 text-[var(--text-secondary)]">{row.codigo || "—"}</td>
                                                <td className="px-3 py-2 text-foreground max-w-[200px] truncate" title={row.nombre}>{row.nombre}</td>
                                                <td className="px-3 py-2 text-[var(--text-secondary)] capitalize">{row.tipo}</td>
                                                <td className="px-3 py-2 text-[var(--text-secondary)]">{row.unidadMedida}</td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.cantInicial > 0 ? fmtQ(row.cantInicial) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.valorInicial > 0 ? fmtN(row.valorInicial) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.cantEntradas > 0 ? fmtQ(row.cantEntradas) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.valorEntradas > 0 ? fmtN(row.valorEntradas) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.cantSalidas > 0 ? fmtQ(row.cantSalidas) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.valorSalidas > 0 ? fmtN(row.valorSalidas) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {fmtQ(row.cantFinal)}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right font-medium text-foreground">
                                                    {fmtN(row.valorFinal)}
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
                                                {fmtN(totales.valorInicial)}
                                            </td>
                                            <td className="px-3 py-2.5" />
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                                {fmtN(totales.valorEntradas)}
                                            </td>
                                            <td className="px-3 py-2.5" />
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                                {fmtN(totales.valorSalidas)}
                                            </td>
                                            <td className="px-3 py-2.5" />
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">
                                                {fmtN(totales.valorFinal)}
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
                                        Inventario inicial (01/01/{anio})
                                    </span>
                                    <span className="tabular-nums font-medium text-foreground">
                                        {fmtN(totales.valorInicial)} Bs.
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[10px]">
                                        + Compras del año
                                    </span>
                                    <span className="tabular-nums font-medium text-foreground">
                                        {fmtN(totales.valorCompras)} Bs.
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[10px]">
                                        − Inventario final (31/12/{anio})
                                    </span>
                                    <span className="tabular-nums font-medium text-foreground">
                                        {fmtN(totales.valorFinal)} Bs.
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
                                    ({libroInventarios.length} {libroInventarios.length === 1 ? "producto" : "productos"} con movimientos en {anio})
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
