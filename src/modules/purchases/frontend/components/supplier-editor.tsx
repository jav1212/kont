"use client";

import { CheckCircle2, IdCard, PhoneCall, StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import type { Supplier } from "@/src/modules/purchases/backend/domain/supplier";

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-default bg-surface-1 outline-none",
    "font-sans text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500 hover:border-border-medium transition-colors duration-150",
].join(" ");

function FormSection({
    icon: Icon,
    title,
    description,
    children,
}: {
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border-t border-border-light first:border-t-0 pt-5 first:pt-0 pb-5 last:pb-0">
            <div className="mb-4 flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-2 text-[var(--text-secondary)]">
                    <Icon size={14} strokeWidth={2} />
                </div>
                <div>
                    <h3 className="font-sans text-[13px] font-semibold text-foreground">{title}</h3>
                    {description && <p className="mt-0.5 font-sans text-[12px] text-[var(--text-tertiary)]">{description}</p>}
                </div>
            </div>
            {children}
        </section>
    );
}

export interface SupplierEditorProps {
    supplier: Supplier;
    saving?: boolean;
    onSave: (supplier: Supplier) => Promise<Supplier | null> | Supplier | null;
    onCancel: () => void;
    onDelete?: () => void;
    submitLabel?: string;
}

export function SupplierEditor({ supplier, saving = false, onSave, onCancel, onDelete, submitLabel }: SupplierEditorProps) {
    const [draft, setDraft] = useState<Supplier>(supplier);

    const set = (key: keyof Supplier, value: string | boolean) => {
        setDraft((current) => ({ ...current, [key]: value }));
    };

    const handleSave = async () => {
        if (!draft.name.trim()) return;
        await onSave(draft);
    };

    return (
        <div className="overflow-hidden rounded-xl border border-border-light bg-surface-1 shadow-[var(--shadow-sm)]">
            <div className="border-b border-border-light px-5 py-5 sm:px-7">
                <h2 className="font-sans text-[18px] font-semibold tracking-tight text-foreground">Editar proveedor</h2>
                <p className="mt-1 font-sans text-[13px] text-[var(--text-secondary)]">Actualiza la información que utilizarás en tus compras y retenciones.</p>
            </div>

            <div className="space-y-1 px-5 py-5 sm:px-7">
                <FormSection icon={IdCard} title="Identidad" description="RIF y razón social del proveedor.">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <BaseInput.Field label="RIF" type="text" value={draft.rif} onValueChange={(value) => set("rif", value)} placeholder="J-12345678-9" />
                        <BaseInput.Field label="Nombre" isRequired type="text" value={draft.name} onValueChange={(value) => set("name", value)} className="md:col-span-2" placeholder="Razón social del proveedor" />
                    </div>
                </FormSection>

                <FormSection icon={PhoneCall} title="Contacto" description="Persona y canales de comunicación.">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <BaseInput.Field label="Persona de contacto" type="text" value={draft.contact} onValueChange={(value) => set("contact", value)} placeholder="Nombre y apellido" />
                        <BaseInput.Field label="Teléfono" type="text" value={draft.phone} onValueChange={(value) => set("phone", value)} placeholder="0414-1234567" />
                        <BaseInput.Field label="Email" type="email" value={draft.email} onValueChange={(value) => set("email", value)} placeholder="contacto@empresa.com" />
                    </div>
                    <div className="mt-4">
                        <BaseInput.Field label="Dirección" type="text" value={draft.address} onValueChange={(value) => set("address", value)} placeholder="Av. Principal, Edif., Piso, Ciudad, Estado" />
                    </div>
                </FormSection>

                <FormSection icon={StickyNote} title="Notas" description="Información operativa interna sobre este proveedor.">
                    <textarea className={`${fieldCls} h-auto py-2 leading-relaxed`} rows={3} value={draft.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Condiciones de pago, catálogo, retenciones aplicables, etc." />
                </FormSection>

                <FormSection icon={CheckCircle2} title="Estado" description="Los proveedores inactivos no aparecen en facturas nuevas.">
                    <label className="inline-flex cursor-pointer select-none items-center gap-3">
                        <span className="relative inline-flex">
                            <input type="checkbox" checked={draft.active} onChange={(event) => set("active", event.target.checked)} className="peer sr-only" />
                            <span className="h-6 w-10 rounded-full border border-border-default bg-surface-2 transition-colors duration-150 peer-checked:border-primary-500 peer-checked:bg-primary-500" />
                            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 peer-checked:translate-x-4" />
                        </span>
                        <span className="font-sans text-[13px] text-foreground">{draft.active ? "Activo" : "Inactivo"}</span>
                    </label>
                </FormSection>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-light bg-surface-2/40 px-5 py-3 sm:px-7">
                {onDelete ? <BaseButton.Root variant="dangerOutline" size="md" onClick={onDelete} isDisabled={saving} leftIcon={<Trash2 size={14} />}>Eliminar</BaseButton.Root> : <span />}
                <div className="flex items-center gap-2">
                    <BaseButton.Root variant="secondary" size="md" onClick={onCancel} isDisabled={saving}>Cancelar</BaseButton.Root>
                    <BaseButton.Root variant="primary" size="md" onClick={handleSave} isDisabled={saving || !draft.name.trim()} loading={saving}>{submitLabel ?? "Guardar cambios"}</BaseButton.Root>
                </div>
            </div>
        </div>
    );
}
