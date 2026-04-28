"use client";

// ISLR Art. 177 report page.
// Shows per-product movement history for the monthly ISLR inventory registry.

import { useEffect, useMemo, useState } from "react";
import {
    Calculator,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Download,
    FileText,
    Layers,
    Printer,
    Scale,
    Search,
    TrendingDown,
    TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { DashboardKpiCard } from "@/src/shared/frontend/components/dashboard-kpi-card";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { IslrProduct, IslrMovement } from "@/src/modules/inventory/backend/domain/islr-report";

// ── helpers ──────────────────────────────────────────────────────────────────

const MONTHS_LONG = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

function currentPeriodKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(key: string): string {
    const [y, m] = key.split("-");
    const month = MONTHS_LONG[(Number(m) - 1) | 0] ?? "";
    return `${month} ${y}`;
}

function shiftPeriod(key: string, delta: number): string {
    const [y, m] = key.split("-").map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function fmtN(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQ(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtDate(d: string) {
    if (!d) return "—";
    const [y, m, day] = d.split("T")[0].split("-");
    return `${day}/${m}/${y}`;
}

const TIPO_LABEL: Record<string, string> = {
    entrada:           "Entrada / Compra",
    salida:            "Salida / Venta",
    ajuste_positivo:   "Ajuste Positivo",
    ajuste_negativo:   "Ajuste Negativo",
    devolucion_entrada: "Devolución / Compra",
    devolucion_salida:  "Devolución / Venta",
    autoconsumo:       "Autoconsumo",
};

const TIPO_TONE: Record<string, string> = {
    entrada:           "text-primary-500",
    salida:            "text-red-500",
    ajuste_positivo:   "text-emerald-600",
    ajuste_negativo:   "text-red-500",
    devolucion_entrada: "text-amber-600",
    devolucion_salida:  "text-amber-600",
    autoconsumo:       "text-primary-500",
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
            `"${p.productName.replace(/"/g, '""')}"`, `"${p.productCode}"`,
            "", `"Saldo Inicial"`, "",
            "", "", fmtQ(p.openingQuantity),
            "", "", fmtN(p.openingCost),
        ].join(sep));

        for (const m of p.movements) {
            lines.push([
                `"${p.productName.replace(/"/g, '""')}"`, `"${p.productCode}"`,
                m.date, `"${(m.reference ?? "").replace(/"/g, '""')}"`, `"${TIPO_LABEL[m.type] ?? m.type}"`,
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

// ── Period picker ─────────────────────────────────────────────────────────────

function PeriodPicker({
    period,
    onChange,
}: {
    period: string;
    onChange: (next: string) => void;
}) {
    const today = currentPeriodKey();
    const isCurrent = period === today;
    return (
        <div className="inline-flex items-center gap-1 rounded-lg border border-border-light bg-surface-1 px-1 h-9">
            <button
                type="button"
                onClick={() => onChange(shiftPeriod(period, -1))}
                className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Mes anterior"
            >
                <ChevronLeft size={14} strokeWidth={2} />
            </button>
            <div className="px-2 flex items-center gap-1.5 min-w-[140px] justify-center">
                <Calendar size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                <span className="text-[12px] uppercase tracking-[0.12em] text-foreground tabular-nums">
                    {periodLabel(period)}
                </span>
            </div>
            <button
                type="button"
                onClick={() => onChange(shiftPeriod(period, 1))}
                className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Mes siguiente"
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

// ── ProductTable ──────────────────────────────────────────────────────────────

function ProductTable({ product }: { product: IslrProduct }) {
    const totalInbound      = product.movements.reduce((s, m) => s + m.inboundQuantity, 0);
    const totalOutbound     = product.movements.reduce((s, m) => s + m.outboundQuantity, 0);
    const totalInboundCost  = product.movements.reduce((s, m) => s + m.inboundCost, 0);
    const totalOutboundCost = product.movements.reduce((s, m) => s + m.outboundCost, 0);
    const last              = product.movements[product.movements.length - 1];
    const finalQty          = last ? last.balanceQuantity : product.openingQuantity;
    const finalCost         = last ? last.balanceCost     : product.openingCost;

    return (
        <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
            {/* Product header */}
            <div className="px-5 py-3 border-b border-border-light bg-surface-2 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-500 px-2 py-0.5 rounded border border-primary-500/30 bg-primary-500/[0.06] tabular-nums">
                        {product.productCode}
                    </span>
                    <span className="text-[13px] text-foreground font-medium truncate" title={product.productName}>
                        {product.productName}
                    </span>
                </div>
                <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] tabular-nums whitespace-nowrap">
                    {product.movements.length} {product.movements.length === 1 ? "movimiento" : "movimientos"}
                </span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-[12px] whitespace-nowrap">
                    <thead>
                        <tr className="border-b border-border-light bg-surface-2/40">
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[90px]">Fecha</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[120px]">Referencia</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[150px]">Tipo Movimiento</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[100px]">Cant. entrada</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[100px]">Cant. salida</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[100px]">Saldo cant.</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[110px]">Costo entrada</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[110px]">Costo salida</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal min-w-[110px]">Saldo costo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Opening balance row */}
                        <tr className="border-b border-border-light/50 bg-surface-2/40">
                            <td className="px-3 py-2 text-[var(--text-tertiary)]">—</td>
                            <td className="px-3 py-2 font-medium text-[var(--text-secondary)] uppercase tracking-[0.10em] text-[10px]">Saldo inicial</td>
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
                                <td className="px-3 py-2 text-[var(--text-secondary)] tabular-nums">{fmtDate(m.date)}</td>
                                <td className="px-3 py-2 text-[var(--text-secondary)] max-w-[150px] truncate" title={m.reference}>
                                    {m.reference || "—"}
                                </td>
                                <td className={["px-3 py-2 text-[12px]", TIPO_TONE[m.type] ?? "text-[var(--text-secondary)]"].join(" ")}>
                                    {TIPO_LABEL[m.type] ?? m.type}
                                </td>
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
                            <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.12em] font-bold text-foreground" colSpan={3}>
                                Subtotal del producto
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[11px] font-bold text-foreground">{fmtQ(totalInbound)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[11px] font-bold text-foreground">{fmtQ(totalOutbound)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[11px] font-bold text-foreground">{fmtQ(finalQty)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[11px] font-bold text-foreground">{fmtN(totalInboundCost)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[11px] font-bold text-foreground">{fmtN(totalOutboundCost)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[11px] font-bold text-primary-500">{fmtN(finalCost)}</td>
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
    const { islrReport, loadingIslrReport, loadIslrReport } = useInventory();

    const [period, setPeriod] = useState<string>(currentPeriodKey());
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!companyId) return;
        loadIslrReport(companyId, period);
    }, [companyId, period, loadIslrReport]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return islrReport;
        return islrReport.filter((p) =>
            (p.productCode + " " + p.productName).toLowerCase().includes(q),
        );
    }, [islrReport, search]);

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
            <PageHeader
                title="Reporte Art. 177 ISLR"
                subtitle={`Reglamento ISLR · Registro mensual · ${periodLabel(period)}`}
            >
                <BaseButton.Root
                    variant="ghost"
                    size="sm"
                    leftIcon={<Printer size={13} strokeWidth={2} />}
                    onClick={() => window.print()}
                    disabled={islrReport.length === 0 || loadingIslrReport}
                >
                    Imprimir
                </BaseButton.Root>
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download size={13} strokeWidth={2} />}
                    onClick={() => exportCSV(islrReport, period)}
                    disabled={islrReport.length === 0 || loadingIslrReport}
                >
                    Exportar CSV
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-6">
                {/* ── KPI strip ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DashboardKpiCard
                        label="Productos"
                        value={islrReport.length}
                        color="primary"
                        icon={Layers}
                        loading={loadingIslrReport}
                        sublabel={`con movimientos en ${periodLabel(period)}`}
                    />
                    <DashboardKpiCard
                        label="Costo entradas"
                        value={`Bs ${fmtN(grandTotal.inboundCost)}`}
                        color="default"
                        icon={TrendingUp}
                        loading={loadingIslrReport}
                        sublabel={`${fmtN(grandTotal.inboundQty)} unidades`}
                    />
                    <DashboardKpiCard
                        label="Costo salidas"
                        value={`Bs ${fmtN(grandTotal.outboundCost)}`}
                        color="default"
                        icon={TrendingDown}
                        loading={loadingIslrReport}
                        sublabel={`${fmtN(grandTotal.outboundQty)} unidades`}
                    />
                    <DashboardKpiCard
                        label="Saldo final"
                        value={`Bs ${fmtN(grandTotal.balanceCost)}`}
                        color="default"
                        icon={Scale}
                        loading={loadingIslrReport}
                        sublabel={`${fmtN(grandTotal.balanceQty)} unidades en stock`}
                    />
                </div>

                {/* ── Toolbar: period + search ──────────────────────────────── */}
                <div className="flex flex-wrap items-center gap-3">
                    <PeriodPicker period={period} onChange={setPeriod} />
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
                            placeholder="Buscar por código o nombre del producto…"
                            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500/60 hover:border-border-medium transition-colors"
                        />
                    </div>
                </div>


                {/* ── Per-product cards ─────────────────────────────────────── */}
                {loadingIslrReport ? (
                    <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                        Cargando reporte ISLR…
                    </div>
                ) : islrReport.length === 0 ? (
                    <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-16 flex flex-col items-center justify-center gap-3 text-center">
                        <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                            <FileText size={20} strokeWidth={1.8} />
                        </div>
                        <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                            Sin movimientos en {periodLabel(period)}
                        </p>
                        <p className="font-sans text-[13px] text-[var(--text-tertiary)] max-w-md">
                            No hay productos con movimientos para el registro mensual del Art. 177 del Reglamento de la Ley de ISLR.
                        </p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-12 flex flex-col items-center gap-2 text-center">
                        <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                            Sin resultados
                        </p>
                        <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                            Ningún producto coincide con tu búsqueda.
                        </p>
                        <button
                            type="button"
                            onClick={() => setSearch("")}
                            className="mt-2 text-[11px] uppercase tracking-[0.14em] text-primary-500 hover:text-primary-600 transition-colors"
                        >
                            Limpiar búsqueda
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4">
                            {filtered.map((p) => (
                                <ProductTable key={p.productId} product={p} />
                            ))}
                        </div>

                        {/* ── Grand total panel ─────────────────────────────── */}
                        <div className="rounded-xl border border-primary-500/30 bg-primary-500/[0.04] overflow-hidden">
                            <div className="px-5 py-3 border-b border-primary-500/20 bg-primary-500/[0.06] flex items-center gap-2">
                                <Calculator size={14} strokeWidth={2} className="text-primary-500" />
                                <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary-500">
                                    Gran total · {islrReport.length} {islrReport.length === 1 ? "producto" : "productos"}
                                </h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12px] whitespace-nowrap">
                                    <tbody>
                                        <tr>
                                            <td className="px-4 py-3 text-[11px] uppercase tracking-[0.12em] font-bold text-foreground" colSpan={3}>
                                                Totales del período
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[12px] font-bold text-foreground min-w-[100px]">
                                                {fmtQ(grandTotal.inboundQty)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[12px] font-bold text-foreground min-w-[100px]">
                                                {fmtQ(grandTotal.outboundQty)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[12px] font-bold text-foreground min-w-[100px]">
                                                {fmtQ(grandTotal.balanceQty)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[12px] font-bold text-foreground min-w-[110px]">
                                                {fmtN(grandTotal.inboundCost)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[12px] font-bold text-foreground min-w-[110px]">
                                                {fmtN(grandTotal.outboundCost)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-[14px] font-bold text-primary-500 min-w-[120px]">
                                                Bs {fmtN(grandTotal.balanceCost)}
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
