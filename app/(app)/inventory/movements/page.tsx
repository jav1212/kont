"use client";

// Page: Movimientos de inventario
// Architectural role: read-only listing of all inventory movements with filters
// (period / type / product). Movement creation lives in the dedicated
// /inventory/{adjustments,returns,self-consumption}/new pages.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";

import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { MovementType } from "@/src/modules/inventory/backend/domain/movement";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fieldCls = [
    "h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls =
    "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

const TYPE_GROUPS: Array<{ label: string; items: Array<{ value: MovementType; label: string }> }> = [
    {
        label: "Entradas",
        items: [
            { value: "entrada", label: "Entrada (compra)" },
            { value: "devolucion_salida", label: "Devolución de cliente" },
            { value: "ajuste_positivo", label: "Ajuste positivo" },
        ],
    },
    {
        label: "Salidas",
        items: [
            { value: "salida", label: "Salida (venta)" },
            { value: "devolucion_entrada", label: "Devolución a proveedor" },
            { value: "ajuste_negativo", label: "Ajuste negativo" },
            { value: "autoconsumo", label: "Autoconsumo" },
        ],
    },
];

function tipoLabel(type: MovementType): string {
    for (const g of TYPE_GROUPS) {
        const found = g.items.find((i) => i.value === type);
        if (found) return found.label;
    }
    return type;
}

function tipoBadgeClass(type: MovementType): string {
    if (type === "entrada" || type === "devolucion_salida") return "border badge-success";
    if (type === "salida" || type === "devolucion_entrada") return "border badge-error";
    if (type === "autoconsumo") return "border border-amber-500/40 text-amber-500 bg-amber-500/[0.06]";
    return "border badge-warning";
}

// ── component ────────────────────────────────────────────────────────────────

export default function MovementsPage() {
    const { companyId } = useCompany();
    const searchParams = useSearchParams();
    const {
        products, movements,
        loadingMovements,
        loadProducts, loadMovements, deleteMovement,
    } = useInventory();

    const initialPeriod = searchParams.get("periodo") ?? searchParams.get("period") ?? currentPeriod();

    const [period, setPeriod] = useState<string>(initialPeriod);
    const [typeFilter, setTypeFilter] = useState<"all" | MovementType>("all");
    const [productFilter, setProductFilter] = useState<string>("");

    useEffect(() => {
        if (companyId) {
            loadProducts(companyId);
            loadMovements(companyId, period);
        }
    }, [companyId, period, loadProducts, loadMovements]);

    const filtered = useMemo(() => {
        return movements.filter((m) => {
            if (typeFilter !== "all" && m.type !== typeFilter) return false;
            if (productFilter && m.productId !== productFilter) return false;
            return true;
        });
    }, [movements, typeFilter, productFilter]);

    async function handleDelete(id?: string) {
        if (!id) return;
        if (!confirm("¿Eliminar este movimiento? Esta acción no se puede deshacer.")) return;
        await deleteMovement(id);
    }

    const totals = useMemo(() => {
        return filtered.reduce(
            (acc, m) => {
                const isInbound = ["entrada", "devolucion_salida", "ajuste_positivo"].includes(m.type);
                if (isInbound) {
                    acc.entradas += m.totalCost;
                    acc.entradasQty += m.quantity;
                } else {
                    acc.salidas += m.totalCost;
                    acc.salidasQty += m.quantity;
                }
                return acc;
            },
            { entradas: 0, salidas: 0, entradasQty: 0, salidasQty: 0 },
        );
    }, [filtered]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Movimientos de inventario"
                subtitle="Historial completo de entradas, salidas, ajustes, devoluciones y autoconsumo"
            />

            <div className="px-8 py-6 space-y-4">

                {/* Toolbar de filtros */}
                <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm px-5 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <label className={labelCls}>Período</label>
                            <BaseInput.Field
                                type="month"
                                className="w-full"
                                value={period}
                                onValueChange={setPeriod}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Tipo</label>
                            <select
                                className={`w-full ${fieldCls}`}
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value as "all" | MovementType)}
                            >
                                <option value="all">Todos los tipos</option>
                                {TYPE_GROUPS.map((g) => (
                                    <optgroup key={g.label} label={g.label}>
                                        {g.items.map((i) => (
                                            <option key={i.value} value={i.value}>{i.label}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Producto</label>
                            <select
                                className={`w-full ${fieldCls}`}
                                value={productFilter}
                                onChange={(e) => setProductFilter(e.target.value)}
                            >
                                <option value="">Todos los productos</option>
                                {products.filter((p) => p.active).map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.code ? `[${p.code}] ` : ""}{p.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end justify-end">
                            <span className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                                {filtered.length} {filtered.length === 1 ? "movimiento" : "movimientos"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Resumen */}
                {filtered.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm px-5 py-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-1">Entradas (cantidad)</p>
                            <p className="text-[18px] font-bold tabular-nums text-foreground">{fmtN(totals.entradasQty)}</p>
                            <p className="mt-1 text-[12px] tabular-nums text-[var(--text-secondary)]">
                                Costo total: <span className="text-foreground">Bs {fmtN(totals.entradas)}</span>
                            </p>
                        </div>
                        <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm px-5 py-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-1">Salidas (cantidad)</p>
                            <p className="text-[18px] font-bold tabular-nums text-foreground">{fmtN(totals.salidasQty)}</p>
                            <p className="mt-1 text-[12px] tabular-nums text-[var(--text-secondary)]">
                                Costo total: <span className="text-foreground">Bs {fmtN(totals.salidas)}</span>
                            </p>
                        </div>
                    </div>
                )}

                {/* Tabla */}
                <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                    {loadingMovements ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-12 text-center">
                            <p className="text-[13px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                                {movements.length === 0
                                    ? "No hay movimientos en este período"
                                    : "No hay movimientos que coincidan con los filtros"}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="border-b border-border-light">
                                        {[
                                            "Fecha",
                                            "Producto",
                                            "Tipo",
                                            "Cantidad",
                                            "Costo U.",
                                            "Costo Total",
                                            "Referencia",
                                            "",
                                        ].map((h, i) => (
                                            <th
                                                key={i}
                                                className="px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap"
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((m) => {
                                        const prod = products.find((p) => p.id === m.productId);
                                        return (
                                            <tr
                                                key={m.id}
                                                className="border-b border-border-light/50 hover:bg-surface-2 transition-colors"
                                            >
                                                <td className="px-3 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{m.date}</td>
                                                <td className="px-3 py-2.5 text-foreground max-w-[180px] truncate">
                                                    {prod?.name ?? m.productId}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium ${tipoBadgeClass(m.type)}`}>
                                                        {tipoLabel(m.type)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 tabular-nums text-foreground">{fmtN(m.quantity)}</td>
                                                <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">{fmtN(m.unitCost)}</td>
                                                <td className="px-3 py-2.5 tabular-nums text-foreground">{fmtN(m.totalCost)}</td>
                                                <td className="px-3 py-2.5 text-[var(--text-secondary)] max-w-[160px] truncate">
                                                    {m.reference || "—"}
                                                </td>
                                                <td className="px-3 py-2.5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(m.id)}
                                                        className="inline-flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                                                        aria-label="Eliminar movimiento"
                                                        title="Eliminar movimiento"
                                                    >
                                                        <Trash2 size={14} strokeWidth={1.8} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
