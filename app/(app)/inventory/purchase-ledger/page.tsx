"use client";

// Page: Libro de Entradas (inventory entry ledger for a given period).
// Architectural role: route-level page component; composes domain types and
// the useInventory hook — no business logic lives here.

import { useEffect, useState, useMemo } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Movement } from "@/src/modules/inventory/backend/domain/movement";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("T")[0].split("-");
    return `${day}/${m}/${y}`;
};

function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");
const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-text-tertiary mb-1.5 block";

// ── EditModal ─────────────────────────────────────────────────────────────────
// Allows editing date, reference, and notes without affecting inventory balance.

function EditModal({
    mov,
    onSave,
    onClose,
    saving,
}: {
    mov: Movement;
    onSave: (date: string, reference: string, notes: string) => void;
    onClose: () => void;
    saving: boolean;
}) {
    const [date, setDate] = useState(mov.date.split("T")[0]);
    const [reference, setReference] = useState(mov.reference ?? "");
    const [notes, setNotes] = useState(mov.notes ?? "");

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-surface-1 rounded-xl border border-border-medium shadow-2xl w-full max-w-md font-mono p-6">
                <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-5">
                    Editar movimiento
                </h2>
                <p className="text-[11px] text-text-tertiary uppercase tracking-[0.1em] mb-4">
                    Solo se pueden editar fecha, referencia y notas sin afectar el saldo del inventario.
                </p>
                <div className="space-y-4">
                    <div>
                        <label className={labelCls}>Fecha *</label>
                        <input
                            type="date"
                            className={fieldCls}
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Referencia</label>
                        <input
                            type="text"
                            className={fieldCls}
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="Referencia interna…"
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Notas</label>
                        <input
                            type="text"
                            className={fieldCls}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Observaciones…"
                        />
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="h-9 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-50 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => onSave(date, reference, notes)}
                        disabled={saving || !date}
                        className="h-9 px-5 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                    >
                        {saving ? "Guardando…" : "Guardar"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── DeleteConfirm ─────────────────────────────────────────────────────────────

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
            <div className="bg-surface-1 rounded-xl border border-border-medium shadow-2xl w-full max-w-sm font-mono p-6">
                <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-3">
                    Eliminar movimiento
                </h2>
                <p className="text-[13px] text-text-secondary mb-1">
                    ¿Eliminar la entrada de <strong className="text-foreground">{productName}</strong>?
                </p>
                <p className="text-[12px] text-text-tertiary mb-5">
                    {fmtN(mov.quantity)} unidades · {fmtDate(mov.date)} · Bs {fmtN(mov.totalCost)}
                </p>
                <div className="px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] text-[11px] text-amber-600 mb-5">
                    La existencia del producto se reducirá en {fmtN(mov.quantity)} unidades.
                </div>
                <div className="flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={deleting}
                        className="h-9 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-50 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={deleting}
                        className="h-9 px-5 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                    >
                        {deleting ? "Eliminando…" : "Eliminar"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function LibroEntradasPage() {
    const { companyId } = useCompany();
    const {
        products, movements,
        loadingProducts, loadingMovements, error, setError,
        loadProducts, loadMovements,
        deleteMovement, updateMovementMeta,
    } = useInventory();

    const [period, setPeriod] = useState(currentPeriod());
    const [editingMov, setEditingMov] = useState<Movement | null>(null);
    const [deletingMov, setDeletingMov] = useState<Movement | null>(null);
    const [actionSaving, setActionSaving] = useState(false);

    useEffect(() => {
        if (!companyId) return;
        loadProducts(companyId);
        loadMovements(companyId, period);
    }, [companyId, loadProducts, loadMovements, period]);

    const entradas = useMemo(
        () => movements.filter((m) => m.type === "entrada" || m.type === "devolucion_salida"),
        [movements],
    );

    const totals = useMemo(() => ({
        quantity:  entradas.reduce((acc, m) => acc + m.quantity, 0),
        totalCost: entradas.reduce((acc, m) => acc + m.totalCost, 0),
    }), [entradas]);

    const loading = loadingProducts || loadingMovements;

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

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Modals */}
            {editingMov && (
                <EditModal
                    mov={editingMov}
                    onSave={handleSaveEdit}
                    onClose={() => { setEditingMov(null); setError(null); }}
                    saving={actionSaving}
                />
            )}
            {deletingMov && (
                <DeleteConfirm
                    mov={deletingMov}
                    productName={products.find((p) => p.id === deletingMov.productId)?.name ?? deletingMov.productId}
                    onConfirm={handleDelete}
                    onClose={() => { setDeletingMov(null); setError(null); }}
                    deleting={actionSaving}
                />
            )}

            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Libro de Entradas
                        </h1>
                        <p className="text-[12px] text-text-tertiary uppercase tracking-[0.12em] mt-0.5">
                            Movimientos de entradas por período
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-[11px] uppercase tracking-[0.12em] text-text-tertiary">Período</label>
                        <input
                            type="month"
                            className="h-9 px-3 rounded-lg border border-border-light bg-surface-1 text-[13px] text-foreground outline-none focus:border-primary-500/60"
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="px-8 py-6 space-y-4">
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-500 text-[13px]">
                        {error}
                    </div>
                )}

                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <p className="text-[12px] uppercase tracking-[0.14em] text-text-tertiary">
                            Entradas del período
                        </p>
                        {entradas.length > 0 && (
                            <p className="text-[11px] text-text-tertiary tabular-nums">
                                {entradas.length} {entradas.length === 1 ? "movimiento" : "movimientos"}
                            </p>
                        )}
                    </div>

                    {loading ? (
                        <div className="px-5 py-12 text-center text-[13px] text-text-tertiary">Cargando…</div>
                    ) : entradas.length === 0 ? (
                        <div className="px-5 py-12 text-center text-[13px] text-text-tertiary">
                            No hay entradas para este período.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px] whitespace-nowrap">
                                <thead>
                                    <tr className="border-b border-border-light bg-surface-2">
                                        {[
                                            { label: "Fecha",       align: "left"  },
                                            { label: "Producto",    align: "left"  },
                                            { label: "Tipo",        align: "left"  },
                                            { label: "Cantidad",    align: "right" },
                                            { label: "Costo unit.", align: "right" },
                                            { label: "Costo total", align: "right" },
                                            { label: "Saldo",       align: "right" },
                                            { label: "Referencia",  align: "left"  },
                                            { label: "",            align: "right" },
                                        ].map((h, i) => (
                                            <th
                                                key={i}
                                                className={`px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-text-tertiary font-normal text-${h.align}`}
                                            >
                                                {h.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {entradas.map((m) => {
                                        const prod = products.find((p) => p.id === m.productId);
                                        const isReturn = m.type === "devolucion_salida";
                                        return (
                                            <tr key={m.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors group">
                                                <td className="px-4 py-2.5 text-text-secondary tabular-nums">{fmtDate(m.date)}</td>
                                                <td className="px-4 py-2.5 text-foreground font-medium max-w-[220px] truncate">
                                                    {prod?.name ?? m.productId}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {isReturn ? (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-[0.08em] border border-amber-500/40 text-amber-500 bg-amber-500/[0.06]">
                                                            Dev. salida
                                                        </span>
                                                    ) : (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-[0.08em] border border-primary-500/30 text-primary-500 bg-primary-500/[0.05]">
                                                            Entrada
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 tabular-nums text-right text-foreground">{fmtN(m.quantity)}</td>
                                                <td className="px-4 py-2.5 tabular-nums text-right text-text-secondary">{fmtN(m.unitCost)}</td>
                                                <td className="px-4 py-2.5 tabular-nums text-right font-medium text-foreground">{fmtN(m.totalCost)}</td>
                                                <td className="px-4 py-2.5 tabular-nums text-right text-text-secondary">{fmtN(m.balanceQuantity)}</td>
                                                <td className="px-4 py-2.5 text-text-secondary max-w-50 truncate">{m.reference || m.notes || "—"}</td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingMov(m)}
                                                            className="h-7 px-2.5 rounded border border-border-light bg-surface-1 hover:bg-surface-2 text-[11px] uppercase tracking-[0.08em] text-text-secondary hover:text-foreground transition-colors"
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeletingMov(m)}
                                                            className="h-7 px-2.5 rounded border border-red-500/20 bg-red-500/[0.04] hover:bg-red-500/[0.08] text-[11px] uppercase tracking-[0.08em] text-red-500 transition-colors"
                                                        >
                                                            Eliminar
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-primary-500/30 bg-primary-500/[0.04]">
                                        <td className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] font-bold text-foreground" colSpan={3}>
                                            Total del período
                                        </td>
                                        <td className="px-4 py-2.5 tabular-nums text-right text-[13px] font-bold text-foreground">
                                            {fmtN(totals.quantity)}
                                        </td>
                                        <td />
                                        <td className="px-4 py-2.5 tabular-nums text-right text-[13px] font-bold text-foreground">
                                            {fmtN(totals.totalCost)}
                                        </td>
                                        <td colSpan={3} />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
