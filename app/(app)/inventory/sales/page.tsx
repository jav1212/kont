"use client";

// Page: Salidas de Inventario (hub).
// Mirrors /inventory/purchases (Entradas) tablero so the user lands on a real
// dashboard with KPIs, period picker, and filterable list of outbound movements
// instead of a placeholder. Outbound = movement.type ∈ { salida, autoconsumo,
// devolucion_entrada }. Editing date/reference/notes happens inline (modal);
// the cross-period record lives at /inventory/sales-ledger.

import { useEffect, useMemo, useState } from "react";
import {
    Search,
    ChevronLeft,
    ChevronRight,
    Calendar,
    BookOpen,
    Plus,
    Sparkles,
    Trash2,
    AlertTriangle,
    ShoppingCart,
    Repeat,
    Wallet,
} from "lucide-react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { DashboardKpiCard } from "@/src/shared/frontend/components/dashboard-kpi-card";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Movement, MovementType } from "@/src/modules/inventory/backend/domain/movement";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtN0 = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("T")[0].split("-");
    return `${day}/${m}/${y}`;
};

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

// ── Type metadata ─────────────────────────────────────────────────────────────

type OutboundKind = "salida" | "autoconsumo" | "devolucion_entrada";

function isOutbound(t: MovementType): t is OutboundKind {
    return t === "salida" || t === "autoconsumo" || t === "devolucion_entrada";
}

const TYPE_LABEL: Record<OutboundKind, string> = {
    salida:             "Venta",
    autoconsumo:        "Autoconsumo",
    devolucion_entrada: "Dev. a proveedor",
};

const TYPE_BADGE_CLS: Record<OutboundKind, string> = {
    salida:             "border-red-500/30 text-red-500 bg-red-500/[0.06]",
    autoconsumo:        "border-primary-500/30 text-primary-500 bg-primary-500/[0.06]",
    devolucion_entrada: "border-amber-500/40 text-amber-600 bg-amber-500/[0.06]",
};

function TypeBadge({ type }: { type: OutboundKind }) {
    return (
        <span
            className={[
                "inline-flex px-1.5 py-0.5 rounded border text-[11px] uppercase tracking-[0.08em] font-medium whitespace-nowrap",
                TYPE_BADGE_CLS[type],
            ].join(" ")}
        >
            {TYPE_LABEL[type]}
        </span>
    );
}

// ── Type filter chips ─────────────────────────────────────────────────────────

type TypeFilter = "all" | OutboundKind;

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
    { value: "all",                label: "Todas" },
    { value: "salida",             label: "Ventas" },
    { value: "autoconsumo",        label: "Autoconsumos" },
    { value: "devolucion_entrada", label: "Devoluciones" },
];

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

// ── Edit modal (date / reference / notes) ────────────────────────────────────

function EditModal({
    mov,
    productName,
    onSave,
    onClose,
    saving,
}: {
    mov: Movement;
    productName: string;
    onSave: (date: string, reference: string, notes: string) => void;
    onClose: () => void;
    saving: boolean;
}) {
    const [date, setDate] = useState(mov.date.split("T")[0]);
    const [reference, setReference] = useState(mov.reference ?? "");
    const [notes, setNotes] = useState(mov.notes ?? "");

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-surface-1 border border-border-medium rounded-xl shadow-xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-border-light">
                    <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                        Editar movimiento
                    </h2>
                    <p className="mt-1 font-sans text-[12px] text-[var(--text-tertiary)] leading-snug">
                        Salida de <strong className="text-foreground">{productName}</strong>. Solo se editan fecha, referencia y notas — el saldo no cambia.
                    </p>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <BaseInput.Field
                        label="Fecha *"
                        type="date"
                        value={date}
                        onValueChange={setDate}
                    />
                    <BaseInput.Field
                        label="Referencia"
                        type="text"
                        value={reference}
                        onValueChange={setReference}
                        placeholder="Nº factura, ticket o referencia interna…"
                    />
                    <BaseInput.Field
                        label="Notas"
                        type="text"
                        value={notes}
                        onValueChange={setNotes}
                        placeholder="Observaciones…"
                    />
                </div>
                <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                    <BaseButton.Root variant="secondary" size="md" onClick={onClose} disabled={saving}>
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root
                        variant="primary"
                        size="md"
                        onClick={() => onSave(date, reference, notes)}
                        disabled={saving || !date}
                    >
                        {saving ? "Guardando…" : "Guardar"}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}

// ── Delete confirm dialog ────────────────────────────────────────────────────

function DeleteConfirm({
    mov,
    productName,
    onConfirm,
    onClose,
    deleting,
}: {
    mov: Movement;
    productName: string;
    onConfirm: () => void;
    onClose: () => void;
    deleting: boolean;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-surface-1 border border-yellow-500/20 rounded-xl shadow-xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-yellow-500/20 bg-yellow-500/[0.06] rounded-t-xl flex items-center gap-2">
                    <AlertTriangle size={16} strokeWidth={2} className="text-yellow-600" />
                    <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-yellow-600">
                        Eliminar salida
                    </h2>
                </div>
                <div className="px-6 py-5 font-sans text-[14px] text-foreground leading-relaxed">
                    <p>
                        Vas a eliminar la salida de <strong>{productName}</strong> del{" "}
                        <strong className="font-mono uppercase tracking-[0.06em] text-[12px]">{fmtDate(mov.date)}</strong>.
                    </p>
                    <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
                        {fmtN0(mov.quantity)} unidades · Bs {fmtN(mov.totalCost)}
                    </p>
                    <p className="mt-3 text-[13px] text-yellow-700 font-medium">
                        La existencia del producto se incrementará en {fmtN0(mov.quantity)} unidades. ¿Continuar?
                    </p>
                </div>
                <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                    <BaseButton.Root variant="secondary" size="md" onClick={onClose} disabled={deleting}>
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root variant="danger" size="md" onClick={onConfirm} disabled={deleting}>
                        {deleting ? "Eliminando…" : "Eliminar"}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SalidasPage() {
    const { companyId } = useCompany();
    const {
        products, movements,
        loadingProducts, loadingMovements,
        loadProducts, loadMovements,
        deleteMovement, updateMovementMeta,
    } = useInventory();

    const [period, setPeriod] = useState<string>(currentPeriodKey());
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [editingMov, setEditingMov] = useState<Movement | null>(null);
    const [deletingMov, setDeletingMov] = useState<Movement | null>(null);
    const [actionSaving, setActionSaving] = useState(false);

    useEffect(() => {
        if (!companyId) return;
        loadProducts(companyId);
        loadMovements(companyId, period);
    }, [companyId, loadProducts, loadMovements, period]);

    // ── derived ────────────────────────────────────────────────────────────────

    const productNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of products) map.set(p.id!, p.name);
        return map;
    }, [products]);

    const inPeriod = useMemo(
        () => movements.filter((m) => isOutbound(m.type) && m.period === period),
        [movements, period],
    );

    const counts = useMemo<Record<TypeFilter, number>>(() => ({
        all:                inPeriod.length,
        salida:             inPeriod.filter((m) => m.type === "salida").length,
        autoconsumo:        inPeriod.filter((m) => m.type === "autoconsumo").length,
        devolucion_entrada: inPeriod.filter((m) => m.type === "devolucion_entrada").length,
    }), [inPeriod]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return inPeriod
            .filter((m) => typeFilter === "all" || m.type === typeFilter)
            .filter((m) => {
                if (!q) return true;
                const haystack = [
                    productNameById.get(m.productId) ?? "",
                    m.reference ?? "",
                    m.notes ?? "",
                ].join(" ").toLowerCase();
                return haystack.includes(q);
            })
            .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    }, [inPeriod, typeFilter, search, productNameById]);

    const kpi = useMemo(() => {
        const ventas       = inPeriod.filter((m) => m.type === "salida");
        const autoconsumos = inPeriod.filter((m) => m.type === "autoconsumo");
        const totalVentaBs = ventas.reduce((acc, m) => {
            const unit = m.precioVentaUnitario ?? 0;
            return acc + (unit * m.quantity);
        }, 0);
        const costoBs = ventas.reduce((acc, m) => acc + (m.totalCost ?? 0), 0)
                      + autoconsumos.reduce((acc, m) => acc + (m.totalCost ?? 0), 0);
        return {
            ventasCount:       ventas.length,
            autoconsumoCount:  autoconsumos.length,
            totalVentaBs,
            costoBs,
        };
    }, [inPeriod]);

    // ── handlers ───────────────────────────────────────────────────────────────

    async function handleSaveEdit(date: string, reference: string, notes: string) {
        if (!editingMov) return;
        setActionSaving(true);
        const result = await updateMovementMeta(editingMov.id!, date, reference, notes);
        setActionSaving(false);
        if (result) setEditingMov(null);
    }

    async function handleDelete() {
        if (!deletingMov) return;
        setActionSaving(true);
        const ok = await deleteMovement(deletingMov.id!);
        setActionSaving(false);
        if (ok) setDeletingMov(null);
    }

    const loading = loadingProducts || loadingMovements;

    // ── render ─────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Salidas de Inventario"
                subtitle={`Tablero · ${periodLabel(period)}`}
            >
                <BaseButton.Root
                    as={Link}
                    href="/inventory/sales-ledger"
                    variant="ghost"
                    size="sm"
                    leftIcon={<BookOpen size={14} strokeWidth={2} />}
                >
                    Libro de salidas
                </BaseButton.Root>
                <BaseButton.Root
                    as={Link}
                    href="/inventory/sales/generator"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Sparkles size={14} strokeWidth={2} />}
                >
                    Generar por monto/margen
                </BaseButton.Root>
                <BaseButton.Root
                    as={Link}
                    href="/inventory/sales/new-manual"
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus size={14} strokeWidth={2} />}
                >
                    Salida manual
                </BaseButton.Root>
            </PageHeader>

            {/* Modals */}
            {editingMov && (
                <EditModal
                    mov={editingMov}
                    productName={productNameById.get(editingMov.productId) ?? editingMov.productId}
                    onSave={handleSaveEdit}
                    onClose={() => { setEditingMov(null); }}
                    saving={actionSaving}
                />
            )}
            {deletingMov && (
                <DeleteConfirm
                    mov={deletingMov}
                    productName={productNameById.get(deletingMov.productId) ?? deletingMov.productId}
                    onConfirm={handleDelete}
                    onClose={() => { setDeletingMov(null); }}
                    deleting={actionSaving}
                />
            )}

            <div className="px-8 py-6 space-y-6">
                {/* ── KPI strip ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DashboardKpiCard
                        label="Ventas registradas"
                        value={kpi.ventasCount}
                        color="success"
                        icon={ShoppingCart}
                        loading={loading}
                        sublabel={`del período ${periodLabel(period)}`}
                    />
                    <DashboardKpiCard
                        label="Autoconsumos"
                        value={kpi.autoconsumoCount}
                        color={kpi.autoconsumoCount > 0 ? "warning" : "default"}
                        icon={Repeat}
                        loading={loading}
                        sublabel={kpi.autoconsumoCount === 0 ? "ninguno en el período" : "movimientos sin venta"}
                    />
                    <DashboardKpiCard
                        label="Total vendido"
                        value={`Bs ${fmtN(kpi.totalVentaBs)}`}
                        color="primary"
                        icon={Wallet}
                        loading={loading}
                        sublabel="suma de ventas s/IVA"
                    />
                    <DashboardKpiCard
                        label="Costo de salidas"
                        value={`Bs ${fmtN(kpi.costoBs)}`}
                        color="default"
                        loading={loading}
                        sublabel="costo del inventario egresado"
                    />
                </div>

                {/* ── Toolbar: period picker + filters + search ─────────────── */}
                <div className="flex flex-wrap items-center gap-3">
                    <PeriodPicker period={period} onChange={setPeriod} />
                    <TypeFilterChips value={typeFilter} onChange={setTypeFilter} counts={counts} />
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search size={14} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar producto, referencia o nota…"
                            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500/60 hover:border-border-medium transition-colors"
                        />
                    </div>
                </div>


                {/* ── Salidas table ─────────────────────────────────────────── */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Salidas del período
                        </h2>
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                            {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
                        </span>
                    </div>

                    {loading ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                            Cargando salidas…
                        </div>
                    ) : inPeriod.length === 0 ? (
                        <div className="px-5 py-16 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <ShoppingCart size={20} strokeWidth={1.8} />
                            </div>
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin salidas en {periodLabel(period)}
                            </p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)] max-w-md">
                                Registra una salida manual para descontar mercancía vendida o autoconsumida, o usa el generador para crear varias ventas a partir de un monto objetivo.
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <BaseButton.Root
                                    as={Link}
                                    href="/inventory/sales/new-manual"
                                    variant="primary"
                                    size="sm"
                                    leftIcon={<Plus size={14} strokeWidth={2} />}
                                >
                                    Salida manual
                                </BaseButton.Root>
                                <BaseButton.Root
                                    as={Link}
                                    href="/inventory/sales/generator"
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={<Sparkles size={14} strokeWidth={2} />}
                                >
                                    Generar por monto
                                </BaseButton.Root>
                            </div>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-12 flex flex-col items-center gap-2 text-center">
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">
                                Sin resultados
                            </p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                                Ningún registro coincide con los filtros activos.
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
                            <table className="w-full min-w-[1024px] text-[13px]">
                                <thead>
                                    <tr className="border-b border-border-light bg-surface-2/50">
                                        {[
                                            { h: "Fecha",         align: "left"  },
                                            { h: "Tipo",          align: "left"  },
                                            { h: "Producto",      align: "left"  },
                                            { h: "Referencia",    align: "left"  },
                                            { h: "Cantidad",      align: "right" },
                                            { h: "Precio unit.",  align: "right" },
                                            { h: "Total venta",   align: "right" },
                                            { h: "Costo",         align: "right" },
                                            { h: "",              align: "left"  },
                                            { h: "",              align: "left"  },
                                        ].map((c, i) => (
                                            <th
                                                key={i}
                                                className={[
                                                    "px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap",
                                                    `text-${c.align}`,
                                                ].join(" ")}
                                            >
                                                {c.h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((m) => {
                                        const productName = productNameById.get(m.productId) ?? m.productId;
                                        const unit = m.precioVentaUnitario ?? null;
                                        const totalVenta = unit != null ? unit * m.quantity : null;
                                        return (
                                            <tr key={m.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                                                    {fmtDate(m.date)}
                                                </td>
                                                <td className="px-4 py-2.5 whitespace-nowrap">
                                                    <TypeBadge type={m.type as OutboundKind} />
                                                </td>
                                                <td className="px-4 py-2.5 text-foreground font-medium max-w-[260px] truncate" title={productName}>
                                                    {productName}
                                                </td>
                                                <td className="px-4 py-2.5 text-[var(--text-secondary)] max-w-[180px] truncate" title={m.reference || ""}>
                                                    {m.reference || "—"}
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums text-[var(--text-primary)] text-right whitespace-nowrap">
                                                    {fmtN0(m.quantity)}
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)] text-right whitespace-nowrap">
                                                    {unit != null ? fmtN(unit) : "—"}
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums font-medium text-foreground text-right whitespace-nowrap">
                                                    {totalVenta != null ? fmtN(totalVenta) : "—"}
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)] text-right whitespace-nowrap">
                                                    {fmtN(m.totalCost)}
                                                </td>
                                                <td className="px-4 py-2.5 whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingMov(m)}
                                                        className="text-[11px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors"
                                                    >
                                                        Editar
                                                    </button>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeletingMov(m)}
                                                        className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                                        aria-label="Eliminar"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={14} strokeWidth={2} />
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

                {/* ── Footer hint linking to ledger ─────────────────────────── */}
                <div className="flex items-center justify-between pt-2 pb-4 font-sans text-[12px] text-[var(--text-tertiary)]">
                    <span>
                        Las salidas también se reflejan en el{" "}
                        <Link href="/inventory/sales-ledger" className="text-primary-500 hover:text-primary-600">libro de salidas</Link>
                        {" "}fiscal con el agrupado por factura y RIF de cliente.
                    </span>
                    <Link
                        href="/inventory/sales-ledger"
                        className="font-mono uppercase tracking-[0.12em] text-[11px] text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                    >
                        Ver libro de salidas →
                    </Link>
                </div>
            </div>
        </div>
    );
}
