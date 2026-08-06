"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlignLeft, ArrowLeft, CheckCircle2, Package, Tag } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory, type Department } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { notify } from "@/src/shared/frontend/notify";

const fieldCls = "w-full rounded-lg border border-border-default bg-surface-1 px-3 py-2.5 font-mono text-[14px] text-foreground outline-none transition-colors hover:border-border-medium focus:border-primary-500";

function Section({ title, description, icon: Icon, children }: { title: string; description: string; icon: typeof Tag; children: React.ReactNode }) {
    return <section className="rounded-xl border border-border-light bg-surface-1 p-5 shadow-[var(--shadow-sm)] sm:p-6"><div className="mb-5 flex items-start gap-3 border-b border-border-light pb-4"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[var(--text-secondary)]"><Icon size={17} /></div><div><h2 className="font-sans text-[15px] font-semibold text-foreground">{title}</h2><p className="mt-0.5 font-sans text-[12px] text-[var(--text-tertiary)]">{description}</p></div></div>{children}</section>;
}

export default function DepartmentDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const id = decodeURIComponent(params.id);
    const { companyId } = useCompany();
    const { departments, products, loadingDepartments, loadDepartments, loadProducts, saveDepartment } = useInventory();
    const [form, setForm] = useState<Department | null>(null);
    const [saving, setSaving] = useState(false);
    const source = useMemo(() => departments.find((d) => d.id === id), [departments, id]);
    const assignedProducts = useMemo(() => products.filter((p) => p.departmentId === id), [products, id]);

    useEffect(() => { if (companyId) { loadDepartments(companyId); loadProducts(companyId); } }, [companyId, loadDepartments, loadProducts]);
    useEffect(() => {
        if (!source || form) return;
        const timer = window.setTimeout(() => setForm({ ...source }), 0);
        return () => window.clearTimeout(timer);
    }, [source, form]);

    async function handleSave() {
        if (!form) return;
        if (!form.name.trim()) { notify.error("El nombre es requerido"); return; }
        setSaving(true);
        const saved = await saveDepartment({ ...form, name: form.name.toUpperCase() });
        setSaving(false);
        if (saved) { setForm(saved); notify.success("Departamento actualizado"); }
    }

    const display = form ?? source;
    return <div className="min-h-full bg-background"><PageHeader title={display?.name ?? "Departamento"} subtitle="Ficha de departamento"><BaseButton.Root variant="primary" size="sm" onClick={handleSave} isDisabled={!form || saving} loading={saving}>Guardar cambios</BaseButton.Root></PageHeader><main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8"><BaseButton.Root variant="secondary" size="sm" onClick={() => router.push("/inventory/departments")} leftIcon={<ArrowLeft size={14} />}>Departamentos</BaseButton.Root>{loadingDepartments ? <div className="rounded-xl border border-border-light bg-surface-1 p-8 font-sans text-[13px] text-[var(--text-secondary)]">Cargando departamento…</div> : !display ? <div className="rounded-xl border border-border-light bg-surface-1 p-8 font-sans text-[13px] text-[var(--text-secondary)]">Departamento no encontrado.</div> : <><div className="flex flex-col gap-4 border-b border-border-light pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Departamento</p><h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-foreground">{display.name}</h1><p className="mt-1 font-sans text-[13px] text-[var(--text-secondary)]">{display.description || "Sin descripción"}</p></div><span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] ${display.active ? "badge-success" : "bg-surface-2 text-[var(--text-tertiary)] border-border-light"}`}><span className="size-1.5 rounded-full bg-current" />{display.active ? "Activo" : "Inactivo"}</span></div><div className="grid gap-3 sm:grid-cols-3">{[["Productos asignados", String(assignedProducts.length)], ["Estado", display.active ? "Activo" : "Inactivo"], ["Creado", display.createdAt ? new Date(display.createdAt).toLocaleDateString("es-VE") : "Sin fecha"]].map(([label, value]) => <div key={label} className="rounded-xl border border-border-light bg-surface-1 p-4 shadow-[var(--shadow-sm)]"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{label}</p><p className="mt-2 font-sans text-[17px] font-semibold text-foreground">{value}</p></div>)}</div><Section icon={Tag} title="Identidad" description="Nombre visible en filtros, productos y reportes."><BaseInput.Field label="Nombre" isRequired value={form?.name ?? ""} onValueChange={(v) => setForm((current) => current ? { ...current, name: v.toUpperCase() } : current)} /></Section><Section icon={AlignLeft} title="Descripción" description="Detalle opcional para distinguir departamentos similares."><textarea className={`${fieldCls} min-h-[110px] resize-y leading-relaxed`} value={form?.description ?? ""} onChange={(e) => setForm((current) => current ? { ...current, description: e.target.value } : current)} placeholder="Describe el tipo de productos que agrupa este departamento." /></Section><Section icon={CheckCircle2} title="Estado" description="Los departamentos inactivos no aparecen al asignar productos nuevos."><label className="inline-flex cursor-pointer items-center gap-3"><input type="checkbox" checked={form?.active ?? false} onChange={(e) => setForm((current) => current ? { ...current, active: e.target.checked } : current)} className="size-4 accent-[var(--primary-500)]" /><span className="font-sans text-[13px] text-foreground">Departamento activo</span></label></Section><Section icon={Package} title="Productos asignados" description="Productos que actualmente pertenecen a este departamento.">{assignedProducts.length === 0 ? <p className="font-sans text-[13px] text-[var(--text-secondary)]">No hay productos asignados.</p> : <div className="divide-y divide-border-light rounded-lg border border-border-light">{assignedProducts.slice(0, 12).map((p) => <div key={p.id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><p className="truncate font-sans text-[13px] font-medium text-foreground">{p.name}</p><p className="font-mono text-[11px] text-[var(--text-tertiary)]">{p.code || "Sin código"}</p></div><span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">{p.currentStock.toLocaleString("es-VE")} {p.measureUnit}</span></div>)}</div>}</Section></>}</main></div>;
}
