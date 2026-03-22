"use client";

import { useEffect, useRef, useState, useMemo, Fragment } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { ReportePeriodoRow } from "@/src/modules/inventory/backend/domain/reporte-periodo";

// ── helpers ──────────────────────────────────────────────────────────────────

function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtN(n: number, dec = 2) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function sumField(rows: ReportePeriodoRow[], key: keyof ReportePeriodoRow): number {
    return rows.reduce((acc, r) => acc + (r[key] as number), 0);
}

// Agrupar por departamento
function groupByDepartamento(rows: ReportePeriodoRow[]) {
    const map = new Map<string, ReportePeriodoRow[]>();
    for (const row of rows) {
        const dep = row.departamentoNombre || "Sin departamento";
        if (!map.has(dep)) map.set(dep, []);
        map.get(dep)!.push(row);
    }
    return Array.from(map.entries());
}

// Columnas numéricas del reporte
const NUM_COLS: { key: keyof ReportePeriodoRow; label: string }[] = [
    { key: "inventarioInicial",  label: "Inv. Inicial"       },
    { key: "costoPromedio",      label: "Costo Prom."        },
    { key: "entradas",           label: "Entradas"           },
    { key: "salidas",            label: "Salidas"            },
    { key: "existenciaActual",   label: "Exist. Actual"      },
    { key: "costoEntradasBs",    label: "Entradas Bs"        },
    { key: "totalSalidasSIvaBs", label: "Salidas S/IVA Bs"   },
    { key: "costoSalidasBs",     label: "Costo Salidas Bs"   },
    { key: "costoAutoconsumo",   label: "Autoconsumo Bs"     },
    { key: "costoActualBs",      label: "Costo Actual Bs"    },
    { key: "ivaPorcentaje",      label: "IVA %"              },
    { key: "totalIvaBs",         label: "IVA Bs"             },
    { key: "totalConIvaBs",      label: "Total c/IVA Bs"     },
];

// CSV export
function exportCSV(rows: ReportePeriodoRow[], periodo: string) {
    const headers = [
        "Código", "Nombre", "Departamento", "Proveedor", "IVA Tipo",
        ...NUM_COLS.map((c) => c.label),
    ];
    const lines = [
        headers.join(","),
        ...rows.map((r) => [
            r.codigo,
            `"${r.nombre}"`,
            `"${r.departamentoNombre}"`,
            `"${r.proveedorNombre}"`,
            r.ivaTipo,
            ...NUM_COLS.map((c) => String(r[c.key])),
        ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-inventario-${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Sub-total row
function SubtotalRow({ label, rows }: { label: string; rows: ReportePeriodoRow[] }) {
    return (
        <tr className="bg-surface-2/60 border-b border-border-light">
            <td className="px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-medium" colSpan={5}>
                Subtotal {label}
            </td>
            {NUM_COLS.map((c) => (
                <td key={c.key} className="px-3 py-1.5 text-[10px] tabular-nums text-[var(--text-secondary)] text-right font-medium whitespace-nowrap">
                    {fmtN(sumField(rows, c.key))}
                </td>
            ))}
        </tr>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ReportePeriodoPage() {
    const { companyId } = useCompany();
    const { reportePeriodo, loadingReporte, error, setError, loadReportePeriodo } = useInventory();

    const [periodo, setPeriodo] = useState(currentPeriod());
    const searchedRef = useRef(false);

    useEffect(() => {
        if (companyId && !searchedRef.current) {
            searchedRef.current = true;
            loadReportePeriodo(companyId, periodo);
        }
    }, [companyId, periodo, loadReportePeriodo]);

    function handleSearch() {
        if (!companyId) return;
        setError(null);
        loadReportePeriodo(companyId, periodo);
    }

    const groups = useMemo(() => groupByDepartamento(reportePeriodo), [reportePeriodo]);

    const totals = useMemo(() =>
        NUM_COLS.map((c) => sumField(reportePeriodo, c.key)),
    [reportePeriodo]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Reporte de Período
                        </h1>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.16em] mt-0.5">
                            Inventario mensual con costos, IVA y movimientos
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
                                onChange={(e) => { searchedRef.current = false; setPeriodo(e.target.value); }}
                                className="h-8 px-2 rounded-lg border border-border-light bg-surface-1 text-[12px] text-foreground outline-none focus:border-primary-500/60"
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={loadingReporte}
                            className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            {loadingReporte ? "Cargando…" : "Generar"}
                        </button>
                        {reportePeriodo.length > 0 && (
                            <button
                                onClick={() => exportCSV(reportePeriodo, periodo)}
                                className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Exportar CSV
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="px-8 py-6">
                {/* Error */}
                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
                    </div>
                )}

                {loadingReporte ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">Cargando reporte…</div>
                ) : reportePeriodo.length === 0 ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">
                        No hay datos para el período seleccionado.
                    </div>
                ) : (
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-[10px] whitespace-nowrap">
                                <thead>
                                    <tr className="border-b border-border-light bg-surface-2">
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal sticky left-0 bg-surface-2 z-10 min-w-[80px]">
                                            Código
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[160px]">
                                            Nombre
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[120px]">
                                            Departamento
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[120px]">
                                            Proveedor
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal">
                                            IVA
                                        </th>
                                        {NUM_COLS.map((c) => (
                                            <th key={c.key} className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal min-w-[100px]">
                                                {c.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {groups.map(([dep, rows]) => (
                                        <Fragment key={dep}>
                                            {/* Group header */}
                                            <tr className="bg-primary-500/[0.04] border-b border-border-light/50">
                                                <td
                                                    colSpan={5 + NUM_COLS.length}
                                                    className="px-3 py-1.5 text-[9px] uppercase tracking-[0.18em] font-bold text-primary-500"
                                                >
                                                    {dep}
                                                </td>
                                            </tr>

                                            {rows.map((r) => (
                                                <tr key={r.codigo} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                    <td className="px-3 py-2 text-[var(--text-secondary)] sticky left-0 bg-surface-1 group-hover:bg-surface-2">
                                                        {r.codigo || "—"}
                                                    </td>
                                                    <td className="px-3 py-2 text-foreground max-w-[180px] truncate" title={r.nombre}>
                                                        {r.nombre}
                                                    </td>
                                                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.departamentoNombre || "—"}</td>
                                                    <td className="px-3 py-2 text-[var(--text-secondary)] max-w-[140px] truncate" title={r.proveedorNombre}>
                                                        {r.proveedorNombre || "—"}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.10em] font-medium ${r.ivaTipo === "exento" ? "border badge-info" : "border badge-warning"}`}>
                                                            {r.ivaTipo === "exento" ? "E" : "G"}
                                                        </span>
                                                    </td>
                                                    {NUM_COLS.map((c) => (
                                                        <td key={c.key} className="px-3 py-2 tabular-nums text-right text-[var(--text-primary)]">
                                                            {fmtN(r[c.key] as number)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}

                                            <SubtotalRow key={`sub-${dep}`} label={dep} rows={rows} />
                                        </Fragment>
                                    ))}

                                    {/* Grand total */}
                                    <tr className="border-t-2 border-primary-500/30 bg-primary-500/[0.04]">
                                        <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.14em] font-bold text-foreground" colSpan={5}>
                                            Total general
                                        </td>
                                        {totals.map((val, i) => (
                                            <td key={i} className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground whitespace-nowrap">
                                                {fmtN(val)}
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
