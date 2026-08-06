"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText, Mail, MapPin, Pencil, Phone, Truck, UserRound, X } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { usePurchases } from "@/src/modules/purchases/frontend/hooks/use-purchases";
import type { Supplier } from "@/src/modules/purchases/backend/domain/supplier";
import { SupplierEditor } from "@/src/modules/purchases/frontend/components/supplier-editor";
import { notify } from "@/src/shared/frontend/notify";

function DetailCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string; value?: string | null }) {
    return (
        <div className="rounded-xl border border-border-light bg-surface-1 p-4">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]"><Icon size={16} strokeWidth={1.8} /><span className="font-sans text-[12px]">{label}</span></div>
            <p className="mt-3 break-words font-sans text-[14px] text-foreground">{value?.trim() || "Sin información"}</p>
        </div>
    );
}

function StatusBadge({ active }: { active: boolean }) {
    return active ? (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-success/25 bg-success/10 px-2.5 py-1 font-sans text-[11px] font-medium text-text-success"><span className="size-1.5 rounded-full bg-text-success" />Activo</span>
    ) : (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border-light bg-surface-2 px-2.5 py-1 font-sans text-[11px] font-medium text-[var(--text-tertiary)]"><span className="size-1.5 rounded-full bg-[var(--text-tertiary)]" />Inactivo</span>
    );
}

function DeletePrompt({ deleting, onCancel, onConfirm }: { deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
    return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/25 bg-error/5 px-4 py-3"><div className="flex items-center gap-2 font-sans text-[13px] text-text-error"><CheckCircle2 size={15} />¿Eliminar definitivamente este proveedor?</div><div className="flex items-center gap-2"><BaseButton.Root variant="secondary" size="sm" onClick={onCancel} isDisabled={deleting} leftIcon={<X size={14} />}>Cancelar</BaseButton.Root><BaseButton.Root variant="danger" size="sm" onClick={onConfirm} isDisabled={deleting} loading={deleting}>Eliminar</BaseButton.Root></div></div>;
}

export default function SupplierDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const { companyId, company } = useCompany();
    const { suppliers, loadingSuppliers, loadSuppliers, saveSupplier, deleteSupplier } = usePurchases();
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const supplierId = useMemo(() => decodeURIComponent(params.id), [params.id]);
    const supplier = suppliers.find((item) => item.id === supplierId) ?? null;

    useEffect(() => {
        if (companyId) void loadSuppliers(companyId);
    }, [companyId, loadSuppliers]);

    async function handleSave(next: Supplier) {
        if (!next.name.trim()) {
            notify.error("El nombre es requerido");
            return null;
        }
        setSaving(true);
        const saved = await saveSupplier(next);
        setSaving(false);
        if (saved) {
            setEditing(false);
            notify.success("Proveedor actualizado");
        }
        return saved;
    }

    async function handleDelete() {
        if (!supplier?.id) return;
        setDeleting(true);
        const ok = await deleteSupplier(supplier.id);
        setDeleting(false);
        if (ok) {
            notify.success("Proveedor eliminado");
            router.push("/purchases/suppliers");
        }
    }

    return (
        <div className="min-h-full bg-background">
            <PageHeader title={supplier?.name ?? "Proveedor"} />
            <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-6 sm:px-8 sm:py-8">
                <BaseButton.Root variant="secondary" size="sm" onClick={() => router.push("/purchases/suppliers")} leftIcon={<ArrowLeft size={14} />}>Proveedores</BaseButton.Root>

                {loadingSuppliers ? (
                    <div className="rounded-xl border border-border-light bg-surface-1 p-8 font-sans text-[13px] text-[var(--text-secondary)]">Cargando proveedor…</div>
                ) : !supplier ? (
                    <div className="space-y-4 rounded-xl border border-border-light bg-surface-1 p-8">
                        <p className="font-sans text-[14px] text-[var(--text-secondary)]">Proveedor no encontrado.</p>
                        <BaseButton.Root variant="secondary" size="sm" onClick={() => router.push("/purchases/suppliers")}>Volver al catálogo</BaseButton.Root>
                    </div>
                ) : editing ? (
                    <>
                        <SupplierEditor
                            key={supplier.id}
                            supplier={supplier}
                            saving={saving}
                            onSave={handleSave}
                            onCancel={() => setEditing(false)}
                            onDelete={() => setConfirmDelete(true)}
                        />
                        {confirmDelete && <DeletePrompt deleting={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={handleDelete} />}
                    </>
                ) : (
                    <>
                        <section className="flex flex-col gap-5 border-b border-border-light pb-6 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-4">
                                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary-500/20 bg-primary-500/10 text-primary-500"><Truck size={21} strokeWidth={1.8} /></div>
                                <div className="min-w-0">
                                    <p className="mb-1 font-sans text-[12px] text-[var(--text-tertiary)]">Proveedor · {company?.name ?? "Empresa"}</p>
                                    <div className="flex flex-wrap items-center gap-3"><h1 className="truncate font-sans text-2xl font-semibold tracking-tight text-foreground">{supplier.name}</h1><StatusBadge active={supplier.active} /></div>
                                    <p className="mt-1 font-mono text-sm text-[var(--text-secondary)]">{supplier.rif || "Sin RIF registrado"}</p>
                                </div>
                            </div>
                            <BaseButton.Root variant="primary" size="sm" onClick={() => setEditing(true)} leftIcon={<Pencil size={14} />}>Editar proveedor</BaseButton.Root>
                        </section>

                        <section className="space-y-4">
                            <div><h2 className="font-sans text-[18px] font-semibold tracking-tight text-foreground">Información del proveedor</h2><p className="mt-1 font-sans text-[13px] text-[var(--text-secondary)]">Datos de contacto y referencia para tus operaciones de compra.</p></div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <DetailCard icon={UserRound} label="Persona de contacto" value={supplier.contact} />
                                <DetailCard icon={Phone} label="Teléfono" value={supplier.phone} />
                                <DetailCard icon={Mail} label="Correo electrónico" value={supplier.email} />
                                <DetailCard icon={MapPin} label="Dirección" value={supplier.address} />
                            </div>
                        </section>

                        <section className="rounded-xl border border-border-light bg-surface-1 p-5 sm:p-6">
                            <div className="flex items-center gap-2 text-[var(--text-secondary)]"><FileText size={16} strokeWidth={1.8} /><h2 className="font-sans text-[15px] font-medium text-foreground">Notas internas</h2></div>
                            <p className="mt-3 whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-[var(--text-secondary)]">{supplier.notes?.trim() || "Sin notas registradas."}</p>
                        </section>

                        {confirmDelete && <DeletePrompt deleting={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={handleDelete} />}
                    </>
                )}
            </main>
        </div>
    );
}
