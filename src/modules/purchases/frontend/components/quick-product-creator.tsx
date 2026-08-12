"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { ResponsiveSelect } from "@/src/shared/frontend/components/responsive-select";
import type { Department } from "@/src/modules/inventory/backend/domain/department";
import type { Product, VatType } from "@/src/modules/inventory/backend/domain/product";

interface Props {
    companyId: string;
    departments: Department[];
    initialName?: string;
    saving?: boolean;
    saveProduct: (product: Product) => Promise<Product | null>;
    onCreated: (product: Product) => void;
    onClose: () => void;
}

export function QuickProductCreator({ companyId, departments, initialName = "", saving: externalSaving = false, saveProduct, onCreated, onClose }: Props) {
    const [form, setForm] = useState({ name: initialName, code: "", barcode: "", vatType: "general" as VatType, departmentId: "" });
    const [saving, setSaving] = useState(false);
    const busy = saving || externalSaving;

    async function handleSave() {
        if (!form.name.trim()) return;
        setSaving(true);
        const product = await saveProduct({
            companyId, name: form.name.trim(), code: form.code.trim(),
            barcode: form.barcode.trim() || undefined, description: "",
            type: "mercancia", measureUnit: "unidad", valuationMethod: "promedio_ponderado",
            currentStock: 0, averageCost: 0, active: true,
            vatType: form.vatType, departmentId: form.departmentId || undefined,
        });
        setSaving(false);
        if (product) onCreated(product);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[440px] max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto rounded-xl border border-border-medium bg-surface-1 p-6 shadow-2xl">
                <div className="mb-5 flex items-center justify-between">
                    <h3 className="text-[14px] font-bold uppercase tracking-[0.14em] text-foreground">Nuevo producto</h3>
                    <button type="button" onClick={onClose} disabled={busy} className="flex h-7 w-7 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-surface-2 hover:text-foreground" aria-label="Cerrar"><X size={14} /></button>
                </div>
                <div className="space-y-3">
                    <BaseInput.Field autoFocus label="Nombre *" value={form.name} onValueChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Nombre del producto" />
                    <BaseInput.Field label="Código" value={form.code} onValueChange={(v) => setForm((f) => ({ ...f, code: v }))} placeholder="Código interno" />
                    <BaseInput.Field label="Código de barras" value={form.barcode} onValueChange={(v) => setForm((f) => ({ ...f, barcode: v }))} placeholder="Opcional" />
                    <div className="grid grid-cols-2 gap-3">
                        <ResponsiveSelect<VatType> label="IVA" value={form.vatType} options={[{ value: "general", label: "General (16%)" }, { value: "exento", label: "Exento" }]} onChange={(value) => setForm((f) => ({ ...f, vatType: value }))} />
                        <ResponsiveSelect searchable label="Departamento" value={form.departmentId} placeholder="Sin departamento" options={[{ value: "", label: "Sin departamento" }, ...departments.filter((d) => d.active && d.id).map((d) => ({ value: d.id!, label: d.name }))]} onChange={(value) => setForm((f) => ({ ...f, departmentId: value }))} />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={onClose} disabled={busy} className="h-9 flex-1 rounded-lg border border-border-medium bg-surface-2 text-[12px] uppercase tracking-[0.12em] text-foreground hover:bg-surface-1">Cancelar</button>
                        <button type="button" onClick={handleSave} disabled={busy || !form.name.trim()} className="h-9 flex-1 rounded-lg bg-primary-500 text-[12px] uppercase tracking-[0.12em] text-white hover:bg-primary-600 disabled:opacity-50">{busy ? "Guardando…" : "Crear producto"}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
