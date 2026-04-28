"use client";

// Annual inventory ledger page (Libro de Inventarios).
// Displays annual inventory movements per product and computes ISLR Art. 177 cost of sales.

import { useEffect, useMemo, useState } from "react";
import {
    BookOpen,
    Boxes,
    Calculator,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Download,
    FileText,
    Layers,
    Search,
    TrendingDown,
    TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { DashboardKpiCard } from "@/src/shared/frontend/components/dashboard-kpi-card";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { InventoryLedgerRow } from "@/src/modules/inventory/backend/domain/inventory-ledger";
import { generateInventoryLedgerPdf } from "@/src/modules/inventory/frontend/utils/inventory-ledger-pdf";

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

const TYPE_LABEL: Record<string, string> = {
    mercancia:           "Mercancía",
    materia_prima:       "Materia prima",
    producto_terminado:  "Producto terminado",
};

type TypeFilter = "all" | "mercancia" | "materia_prima" | "producto_terminado";

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
    { value: "all",                label: "Todos" },
    { value: "mercancia",          label: "Mercancía" },
    { value: "materia_prima",      label: "M. prima" },
    { value: "producto_terminado", label: "Terminado" },
];

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
            `"${r.name.replace(/"/g, '""')}"`,
            `"${TYPE_LABEL[r.type] ?? r.type}"`,
            `"${r.measureUnit}"`,
            r.openingQuantity,
            r.openingValue.toFixed(2),
            r.inboundQuantity,
            r.inboundValue.toFixed(2),
            r.outboundQuantity,
            r.outboundValue.toFixed(2),
            r.closingQuantity,
            r.closingValue.toFixed(2),
            r.purchasesValue.toFixed(2),
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

// ── Year picker ───────────────────────────────────────────────────────────────

function YearPicker({
    year,
    onChange,
}: {
    year: number;
    onChange: (y: number) => void;
}) {
    const today = new Date().getFullYear();
    const isCurrent = year === today;
    return (
        <div className="inline-flex items-center gap-1 rounded-lg border border-border-light bg-surface-1 px-1 h-9">
            <button
                type="button"
                onClick={() => onChange(year - 1)}
                className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Año anterior"
            >
                <ChevronLeft size={14} strokeWidth={2} />
            </button>
            <div className="px-2 flex items-center gap-1.5 min-w-[90px] justify-center">
                <Calendar size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                <span className="text-[12px] uppercase tracking-[0.12em] text-foreground tabular-nums">
                    {year}
                </span>
            </div>
            <button
                type="button"
                onClick={() => onChange(year + 1)}
                className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Año siguiente"
            >
                <ChevronRight size={14} strokeWidth={2} />
            </button>
            {!isCurrent && (
                <button
                    type="button"
                    onClick={() => onChange(today)}
                    className="ml-1 px-2 h-7 rounded text-[10px] uppercase tracking-[0.14em] text-primary-500 hover:bg-primary-500/10 transition-colors"
                >
                    Hoy
                </button>
            )}
        </div>
    );
}

// ── Type filter chips ─────────────────────────────────────────────────────────

function TypeFilterChips({
    value,
    onChange,
    counts,
}: {
    value: TypeFilter;
    onChange: (v: TypeFilter) => void;
    counts: Record<TypeFilter, number>;
}) {
    return (
        <div className="inline-flex rounded-lg border border-border-light bg-surface-1 overflow-hidden">
            {TYPE_OPTIONS.map((opt, i) => {
                const active = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={[
                            "px-3 h-9 text-[11px] uppercase tracking-[0.12em] transition-colors flex items-center gap-1.5",
                            i > 0 ? "border-l border-border-light" : "",
                            active
                                ? "bg-primary-500/10 text-primary-500"
                                : "text-[var(--text-secondary)] hover:bg-surface-2",
                        ].join(" ")}
                    >
                        {opt.label}
                        <span
                            className={[
                                "px-1.5 py-0.5 rounded text-[10px] tabular-nums",
                                active ? "bg-primary-500/15 text-primary-500" : "bg-surface-2 text-[var(--text-tertiary)]",
                            ].join(" ")}
                        >
                            {counts[opt.value]}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function LibroInventariosPage() {
    const { companyId, company } = useCompany();
    const {
        inventoryLedger, loadingInventoryLedger, loadInventoryLedger,
    } = useInventory();

    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

    useEffect(() => {
        if (!companyId) return;
        loadInventoryLedger(companyId, year);
    }, [companyId, year, loadInventoryLedger]);

    const counts = useMemo<Record<TypeFilter, number>>(() => ({
        all:                inventoryLedger.length,
        mercancia:          inventoryLedger.filter((r) => r.type === "mercancia").length,
        materia_prima:      inventoryLedger.filter((r) => r.type === "materia_prima").length,
        producto_terminado: inventoryLedger.filter((r) => r.type === "producto_terminado").length,
    }), [inventoryLedger]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return inventoryLedger
            .filter((r) => typeFilter === "all" || r.type === typeFilter)
            .filter((r) => {
                if (!q) return true;
                return (r.code + " " + r.name).toLowerCase().includes(q);
            });
    }, [inventoryLedger, typeFilter, search]);

    const totals = useMemo(() => ({
        openingValue:   sum(inventoryLedger, "openingValue"),
        inboundValue:   sum(inventoryLedger, "inboundValue"),
        outboundValue:  sum(inventoryLedger, "outboundValue"),
        closingValue:   sum(inventoryLedger, "closingValue"),
        purchasesValue: sum(inventoryLedger, "purchasesValue"),
    }), [inventoryLedger]);

    const filteredTotals = useMemo(() => ({
        openingValue:  sum(filtered, "openingValue"),
        inboundValue:  sum(filtered, "inboundValue"),
        outboundValue: sum(filtered, "outboundValue"),
        closingValue:  sum(filtered, "closingValue"),
    }), [filtered]);

    // ISLR Art. 177 formula: Costo Ventas = Inv. Inicial + Compras − Inv. Final
    const costoVentas = totals.openingValue + totals.purchasesValue - totals.closingValue;

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Libro de Inventarios Anual"
                subtitle={`Código de Comercio Art. 36 · Ejercicio ${year}`}
            >
                <BaseButton.Root
                    variant="ghost"
                    size="sm"
                    leftIcon={<FileText size={13} strokeWidth={2} />}
                    onClick={() => generateInventoryLedgerPdf(filtered, {
                        companyName:    company?.name ?? "Empresa",
                        companyRif:     company?.rif,
                        year,
                        typeFilterLabel: typeFilter === "all" ? undefined : TYPE_LABEL[typeFilter],
                    })}
                    disabled={filtered.length === 0 || loadingInventoryLedger}
                >
                    PDF
                </BaseButton.Root>
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download size={13} strokeWidth={2} />}
                    onClick={() => exportCSV(filtered, year)}
                    disabled={filtered.length === 0 || loadingInventoryLedger}
                >
                    Exportar CSV
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-6">
                {/* ── KPI strip ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DashboardKpiCard
                        label="Inv. inicial"
                        value={`Bs ${fmtN(totals.openingValue)}`}
                        color="default"
                        icon={Boxes}
                        loading={loadingInventoryLedger}
                        sublabel={`al 01/01/${year}`}
                    />
                    <DashboardKpiCard
                        label="Compras del año"
                        value={`Bs ${fmtN(totals.purchasesValue)}`}
                        color="default"
                        icon={TrendingUp}
                        loading={loadingInventoryLedger}
                        sublabel="entradas confirmadas"
                    />
                    <DashboardKpiCard
                        label="Inv. final"
                        value={`Bs ${fmtN(totals.closingValue)}`}
                        color="default"
                        icon={TrendingDown}
                        loading={loadingInventoryLedger}
                        sublabel={`al 31/12/${year}`}
                    />
                    <DashboardKpiCard
                        label="Costo de ventas"
                        value={`Bs ${fmtN(costoVentas)}`}
                        color="primary"
                        icon={Calculator}
                        loading={loadingInventoryLedger}
                        sublabel="ISLR Art. 177"
                    />
                </div>

                {/* ── Toolbar: year + type filter + search ──────────────────── */}
                <div className="flex flex-wrap items-center gap-3">
                    <YearPicker year={year} onChange={setYear} />
                    <TypeFilterChips value={typeFilter} onChange={setTypeFilter} counts={counts} />
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search
                            size={14}
                            strokeWidth={2}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
                        />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por código o nombre…"
                            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500/60 hover:border-border-medium transition-colors"
                        />
                    </div>
                </div>


                {/* ── Main table ────────────────────────────────────────────── */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Productos del ejercicio
                        </h2>
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                            {filtered.length} {filtered.length === 1 ? "producto" : "productos"}
                        </span>
                    </div>

                    {loadingInventoryLedger ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                            Cargando libro de inventarios…
                        </div>
                    ) : inventoryLedger.length === 0 ? (
                        <div className="px-5 py-16 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <BookOpen size={20} strokeWidth={1.8} />
                            </div>
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin movimientos en {year}
                            </p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)] max-w-md">
                                Aún no se han registrado entradas, salidas ni saldos iniciales para este ejercicio.
                            </p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-12 flex flex-col items-center gap-2 text-center">
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin resultados
                            </p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                                Ningún producto coincide con los filtros activos.
                            </p>
                            <button
                                type="button"
                                onClick={() => { setSearch(""); setTypeFilter("all"); }}
                                className="mt-2 text-[11px] uppercase tracking-[0.14em] text-primary-500 hover:text-primary-600 transition-colors"
                            >
                                Limpiar filtros
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1100px] text-[12px] whitespace-nowrap">
                                <thead className="sticky top-0 z-10">
                                    <tr className="border-b border-border-light bg-surface-2/80 backdrop-blur-sm">
                                        <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Código</th>
                                        <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[200px]">Producto</th>
                                        <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[110px]">Tipo</th>
                                        <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[60px]">Unidad</th>
                                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Cant. ini.</th>
                                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[100px]">Valor ini.</th>
                                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Entradas</th>
                                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[100px]">Valor ent.</th>
                                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Salidas</th>
                                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[100px]">Valor sal.</th>
                                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[80px]">Cant. fin.</th>
                                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[110px]">Valor final</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((row) => (
                                        <tr key={row.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-3 py-2 text-[var(--text-secondary)]">{row.code || "—"}</td>
                                            <td className="px-3 py-2 text-foreground font-medium max-w-[260px] truncate" title={row.name}>{row.name}</td>
                                            <td className="px-3 py-2 text-[var(--text-secondary)] capitalize">
                                                {TYPE_LABEL[row.type] ?? row.type}
                                            </td>
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
                                            <td className="px-3 py-2 tabular-nums text-right text-foreground">
                                                {fmtQ(row.closingQuantity)}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums text-right font-medium text-foreground">
                                                {fmtN(row.closingValue)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-primary-500/30 bg-primary-500/[0.04]">
                                        <td className="px-3 py-3 text-[11px] uppercase tracking-[0.12em] font-bold text-foreground" colSpan={4}>
                                            {typeFilter === "all" ? "Total general" : `Subtotal · ${TYPE_LABEL[typeFilter]}`}
                                        </td>
                                        <td className="px-3 py-3" />
                                        <td className="px-3 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(filteredTotals.openingValue)}
                                        </td>
                                        <td className="px-3 py-3" />
                                        <td className="px-3 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(filteredTotals.inboundValue)}
                                        </td>
                                        <td className="px-3 py-3" />
                                        <td className="px-3 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(filteredTotals.outboundValue)}
                                        </td>
                                        <td className="px-3 py-3" />
                                        <td className="px-3 py-3 tabular-nums text-right text-[12px] font-bold text-foreground">
                                            {fmtN(filteredTotals.closingValue)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── ISLR summary panel ────────────────────────────────────── */}
                {inventoryLedger.length > 0 && !loadingInventoryLedger && (
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light bg-surface-2 flex items-center gap-2">
                            <Calculator size={14} strokeWidth={2} className="text-primary-500" />
                            <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                                Resumen ISLR Art. 177 · Costo de Ventas
                            </h2>
                        </div>
                        <div className="px-6 py-5 space-y-2.5 text-[13px]">
                            <div className="flex items-center justify-between">
                                <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[11px] flex items-center gap-2">
                                    <Layers size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                                    Inventario inicial · 01/01/{year}
                                </span>
                                <span className="tabular-nums font-medium text-foreground">
                                    Bs {fmtN(totals.openingValue)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[11px] flex items-center gap-2">
                                    <TrendingUp size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                                    + Compras del año
                                </span>
                                <span className="tabular-nums font-medium text-foreground">
                                    Bs {fmtN(totals.purchasesValue)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[11px] flex items-center gap-2">
                                    <TrendingDown size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                                    − Inventario final · 31/12/{year}
                                </span>
                                <span className="tabular-nums font-medium text-foreground">
                                    Bs {fmtN(totals.closingValue)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between pt-3 border-t border-border-light">
                                <span className="text-[11px] uppercase tracking-[0.14em] font-bold text-foreground">
                                    = Costo de ventas
                                </span>
                                <span className="text-[18px] font-bold tabular-nums text-primary-500">
                                    Bs {fmtN(costoVentas)}
                                </span>
                            </div>
                            <p className="font-sans text-[12px] text-[var(--text-tertiary)] pt-1">
                                Calculado a partir de {inventoryLedger.length} {inventoryLedger.length === 1 ? "producto" : "productos"} con movimientos en {year}.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
