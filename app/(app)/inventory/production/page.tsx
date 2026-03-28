"use client";

// Production (Produccion) page.
// Allows recording transformation batches: consumes raw materials to produce finished products.

import { useEffect, useState } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Transformation, TransformationInput } from "@/src/modules/inventory/backend/domain/transformation";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function isoToday() { return new Date().toISOString().split("T")[0]; }
function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

// ── component ─────────────────────────────────────────────────────────────────

export default function ProductionPage() {
    const { companyId } = useCompany();
    const {
        products, transformations,
        loadingProducts, loadingTransformations, error, setError,
        loadProducts, loadTransformations, saveTransformation,
    } = useInventory();

    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState<Omit<Transformation, "id" | "createdAt">>({
        companyId:         "",
        description:       "",
        date:              isoToday(),
        period:            currentPeriod(),
        finishedProductId: null,
        producedQuantity:  0,
        notes:             "",
        inputs:            [],
    });

    const [inputs, setInputs] = useState<TransformationInput[]>([
        { productId: "", quantity: 0, unitCost: 0 },
    ]);

    useEffect(() => {
        if (!companyId) return;
        loadProducts(companyId);
        loadTransformations(companyId);
    }, [companyId, loadProducts, loadTransformations]);

    const rawMaterials    = products.filter((p) => p.active && p.type === "materia_prima");
    const finishedProducts = products.filter((p) => p.active && p.type === "producto_terminado");

    const batchCost = inputs.reduce((s, c) => s + (c.quantity * c.unitCost), 0);

    function setF<K extends keyof typeof form>(k: K, v: typeof form[K]) {
        setForm((f) => ({ ...f, [k]: v }));
    }

    function addInput() {
        setInputs((c) => [...c, { productId: "", quantity: 0, unitCost: 0 }]);
    }

    function removeInput(idx: number) {
        setInputs((c) => c.filter((_, i) => i !== idx));
    }

    function setInput(idx: number, k: keyof TransformationInput, v: string | number) {
        setInputs((cs) =>
            cs.map((c, i) => {
                if (i !== idx) return c;
                const updated = { ...c, [k]: v };
                // Auto-fill unit cost from product average cost
                if (k === "productId") {
                    const p = products.find((x) => x.id === v);
                    if (p) updated.unitCost = p.averageCost;
                }
                return updated;
            })
        );
    }

    async function handleSave() {
        if (!companyId) return;
        if (!form.description.trim()) { setError("La descripción es requerida"); return; }
        setSaving(true);
        const transformation: Transformation = {
            ...form,
            companyId: companyId,
            period:    form.date.slice(0, 7),
            inputs:    inputs.filter((c) => c.productId && c.quantity > 0),
        };
        const saved = await saveTransformation(transformation);
        setSaving(false);
        if (saved) {
            setForm({
                companyId:         companyId,
                description:       "",
                date:              isoToday(),
                period:            currentPeriod(),
                finishedProductId: null,
                producedQuantity:  0,
                notes:             "",
                inputs:            [],
            });
            setInputs([{ productId: "", quantity: 0, unitCost: 0 }]);
            loadProducts(companyId); // refresh stock
        }
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Producción" subtitle="Lotes de transformación y producción" />

            <div className="px-8 py-6 grid grid-cols-5 gap-6">
                {/* Left: form */}
                <div className="col-span-2 space-y-4">
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground mb-4">
                            Nuevo lote
                        </h2>

                        {error && (
                            <div className="mb-4 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                                {error}
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label className={labelCls}>Descripción *</label>
                                <input className={fieldCls} value={form.description} onChange={(e) => setF("description", e.target.value)} placeholder="Ej: Lote producción 001" />
                            </div>

                            <div>
                                <label className={labelCls}>Fecha</label>
                                <input type="date" className={fieldCls} value={form.date} onChange={(e) => setF("date", e.target.value)} />
                            </div>

                            <div>
                                <label className={labelCls}>Producto terminado</label>
                                <select className={fieldCls} value={form.finishedProductId ?? ""} onChange={(e) => setF("finishedProductId", e.target.value || null)}>
                                    <option value="">— ninguno —</option>
                                    {finishedProducts.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className={labelCls}>Cantidad producida</label>
                                <input
                                    type="number" min="0" step="0.0001" className={fieldCls}
                                    value={form.producedQuantity || ""}
                                    onChange={(e) => setF("producedQuantity", parseFloat(e.target.value) || 0)}
                                />
                            </div>

                            {/* Inputs (raw material consumption) */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className={labelCls + " mb-0"}>Consumos de materias primas</label>
                                    <button onClick={addInput} className="text-[9px] uppercase tracking-[0.12em] text-primary-500 hover:text-primary-600 transition-colors">
                                        + Agregar
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {inputs.map((c, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <select
                                                className="flex-1 h-8 px-2 rounded border border-border-light bg-surface-1 text-[11px] text-foreground outline-none"
                                                value={c.productId}
                                                onChange={(e) => setInput(idx, "productId", e.target.value)}
                                            >
                                                <option value="">Materia prima…</option>
                                                {rawMaterials.map((p) => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                                {/* Also allow any active product */}
                                                {products.filter((p) => p.active && p.type !== "materia_prima").map((p) => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="number" min="0.0001" step="0.0001" placeholder="Cant."
                                                className="w-20 h-8 px-2 rounded border border-border-light bg-surface-1 text-[11px] text-foreground tabular-nums outline-none"
                                                value={c.quantity || ""}
                                                onChange={(e) => setInput(idx, "quantity", parseFloat(e.target.value) || 0)}
                                            />
                                            <input
                                                type="number" min="0" step="0.0001" placeholder="Costo U."
                                                className="w-24 h-8 px-2 rounded border border-border-light bg-surface-1 text-[11px] text-foreground tabular-nums outline-none"
                                                value={c.unitCost || ""}
                                                onChange={(e) => setInput(idx, "unitCost", parseFloat(e.target.value) || 0)}
                                            />
                                            <button onClick={() => removeInput(idx)} className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors text-[13px]">
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Batch total cost */}
                            <div className="pt-2 border-t border-border-light">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Costo total del lote</span>
                                    <span className="text-[14px] font-bold tabular-nums text-foreground">{fmtN(batchCost)}</span>
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Notas</label>
                                <input className={fieldCls} value={form.notes} onChange={(e) => setF("notes", e.target.value)} />
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-border-light">
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                onClick={handleSave}
                                disabled={saving}
                                fullWidth
                            >
                                {saving ? "Procesando…" : "Registrar lote"}
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>

                {/* Right: transformations list */}
                <div className="col-span-3">
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                                Lotes registrados
                            </p>
                        </div>

                        {loadingTransformations ? (
                            <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">Cargando…</div>
                        ) : transformations.length === 0 ? (
                            <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">
                                No hay lotes registrados.
                            </div>
                        ) : (
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="border-b border-border-light">
                                        {["Fecha","Descripción","Prod. Terminado","Cant. Producida","Período","Notas"].map((h) => (
                                            <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {transformations.map((t) => {
                                        const prod = products.find((p) => p.id === t.finishedProductId);
                                        return (
                                            <tr key={t.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{t.date}</td>
                                                <td className="px-4 py-2.5 text-foreground font-medium">{t.description}</td>
                                                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{prod?.name ?? "—"}</td>
                                                <td className="px-4 py-2.5 tabular-nums text-foreground">{fmtN(t.producedQuantity)}</td>
                                                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{t.period}</td>
                                                <td className="px-4 py-2.5 text-[var(--text-secondary)] max-w-[120px] truncate">{t.notes || "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
