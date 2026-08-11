"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BadgeDollarSign, Boxes, CalendarDays, CheckCircle2, Coins, Receipt, SlidersHorizontal, Tag, TrendingUp } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory, type Product } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { ProductType, MeasureUnit, ValuationMethod, VatType } from "@/src/modules/inventory/backend/domain/product";
import type { CustomFieldDefinition } from "@/src/modules/companies/frontend/hooks/use-companies";
import { notify } from "@/src/shared/frontend/notify";
import { ProductSalePricingFields, formatProductSalePricing } from "@/src/modules/inventory/frontend/components/product-sale-pricing-fields";
import { ProductHistoryChart } from "@/src/modules/inventory/frontend/components/product-history-chart";

const fieldCls = "h-10 w-full rounded-lg border border-border-default bg-surface-1 px-3 font-mono text-[14px] text-foreground outline-none transition-colors hover:border-border-medium focus:border-primary-500";
const labelCls = "mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]";
const units: { value: MeasureUnit; label: string }[] = [
    { value: "unidad", label: "Unidad" }, { value: "kg", label: "Kg" }, { value: "g", label: "g" },
    { value: "m", label: "m" }, { value: "m2", label: "m²" }, { value: "m3", label: "m³" },
    { value: "litro", label: "Litro" }, { value: "caja", label: "Caja" }, { value: "rollo", label: "Rollo" }, { value: "paquete", label: "Paquete" },
];

function Section({ title, description, icon: Icon, children, className = "" }: { title: string; description: string; icon: typeof Tag; children: React.ReactNode; className?: string }) {
    return (
        <section className={`order-2 rounded-xl border border-border-light bg-surface-1 p-5 shadow-[var(--shadow-sm)] sm:p-6 ${className}`}>
            <div className="mb-5 flex items-start gap-3 border-b border-border-light pb-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[var(--text-secondary)]"><Icon size={17} /></div>
                <div><h2 className="font-sans text-[15px] font-semibold text-foreground">{title}</h2><p className="mt-0.5 font-sans text-[12px] text-[var(--text-tertiary)]">{description}</p></div>
            </div>
            {children}
        </section>
    );
}

export default function ProductDetailPage() {
    const params = useParams<{ id: string }>();
    const id = decodeURIComponent(params.id);
    const { companyId, company } = useCompany();
    const { products, departments, loadingProducts, loadingDepartments, loadProducts, loadDepartments, saveProduct, loadProductHistory, productHistory, loadingProductHistory } = useInventory();
    const [form, setForm] = useState<Product | null>(null);
    const [saving, setSaving] = useState(false);
    const customFields: CustomFieldDefinition[] = company?.inventoryConfig?.customFields ?? [];
    const source = useMemo(() => products.find((p) => p.id === id), [products, id]);

    useEffect(() => {
        if (companyId) { loadProducts(companyId); loadDepartments(companyId); }
    }, [companyId, loadProducts, loadDepartments]);

    useEffect(() => {
        if (!source || form) return;
        const timer = window.setTimeout(() => setForm({ ...source, valuationMethod: source.valuationMethod === "peps" ? "promedio_ponderado" : source.valuationMethod }), 0);
        return () => window.clearTimeout(timer);
    }, [source, form]);

    useEffect(() => {
        if (companyId && source?.id) void loadProductHistory(companyId, source.id);
    }, [companyId, source?.id, loadProductHistory]);

    function set<K extends keyof Product>(key: K, value: Product[K]) { setForm((current) => current ? { ...current, [key]: value } : current); }

    async function handleSave() {
        if (!form) return;
        if (!form.name.trim()) { notify.error("El nombre es requerido"); return; }
        setSaving(true);
        const saved = await saveProduct(form);
        setSaving(false);
        if (saved) { notify.success("Producto actualizado"); setForm(saved); }
    }

    const display = form ?? source;

    return (
        <div className="min-h-full bg-background">
            <PageHeader title={display?.name ?? "Producto"} subtitle="Ficha de producto">
                <BaseButton.Root variant="primary" size="sm" onClick={handleSave} isDisabled={!form || saving} loading={saving}>Guardar cambios</BaseButton.Root>
            </PageHeader>
            <main className="mx-auto flex w-full max-w-6xl flex-col space-y-6 px-2.5 py-6 sm:px-4 lg:px-5">
                {loadingProducts || loadingDepartments ? <div className="rounded-xl border border-border-light bg-surface-1 p-8 font-sans text-[13px] text-[var(--text-secondary)]">Cargando producto…</div> : !display ? <div className="rounded-xl border border-border-light bg-surface-1 p-8 font-sans text-[13px] text-[var(--text-secondary)]">Producto no encontrado.</div> : (
                    <>
                        <div className="flex flex-col gap-4 rounded-2xl border border-border-light bg-surface-1 p-5 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
                            <div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Producto</p><h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-foreground">{display.name}</h1><p className="mt-1 font-mono text-[13px] text-[var(--text-secondary)]">{display.code || "Sin código"}</p></div>
                            <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] ${display.active ? "badge-success" : "bg-surface-2 text-[var(--text-tertiary)] border-border-light"}`}><span className="size-1.5 rounded-full bg-current" />{display.active ? "Activo" : "Inactivo"}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {[ ["Existencia", `${display.currentStock.toLocaleString("es-VE")} ${display.measureUnit}`], ["Costo promedio", `Bs. ${display.averageCost.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`], ["Precio de venta", formatProductSalePricing(display)], ["Departamento", display.departmentName || "Sin departamento"] ].map(([label, value]) => <div key={label} className="rounded-xl border border-border-light bg-surface-1 p-4 shadow-[var(--shadow-sm)]"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{label}</p><p className="mt-2 font-sans text-[17px] font-semibold text-foreground">{value}</p></div>)}
                        </div>
                        <Section icon={Tag} title="Identidad" description="Código interno, código de barras y nombre comercial."><div className="grid gap-4 md:grid-cols-4"><BaseInput.Field label="Código" value={form?.code ?? ""} onValueChange={(v) => set("code", v)} /><BaseInput.Field label="Código de barras" value={form?.barcode ?? ""} onValueChange={(v) => set("barcode", v)} /><BaseInput.Field label="Nombre" isRequired className="md:col-span-2" value={form?.name ?? ""} onValueChange={(v) => set("name", v)} /></div><div className="mt-4"><BaseInput.Field label="Descripción" value={form?.description ?? ""} onValueChange={(v) => set("description", v)} /></div></Section>
                        <Section icon={Boxes} title="Clasificación" description="Tipo, unidad y método de valuación."><div className="grid gap-4 md:grid-cols-3"><div><label className={labelCls}>Tipo</label><select className={fieldCls} value={form?.type ?? "mercancia"} onChange={(e) => set("type", e.target.value as ProductType)}><option value="mercancia">Mercancía</option></select></div><div><label className={labelCls}>Unidad de medida</label><select className={fieldCls} value={form?.measureUnit ?? "unidad"} onChange={(e) => set("measureUnit", e.target.value as MeasureUnit)}>{units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></div><div><label className={labelCls}>Método de valuación</label><select className={fieldCls} value={form?.valuationMethod ?? "promedio_ponderado"} onChange={(e) => set("valuationMethod", e.target.value as ValuationMethod)}><option value="promedio_ponderado">Promedio ponderado</option></select></div></div></Section>
                        <Section icon={Receipt} title="Departamento e IVA" description="Clasificación fiscal y operativa."><div className="grid gap-4 md:grid-cols-2"><div><label className={labelCls}>Departamento</label><select className={fieldCls} value={form?.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value || undefined)}><option value="">Sin departamento</option>{departments.filter((d) => d.active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div><div><label className={labelCls}>IVA</label><select className={fieldCls} value={form?.vatType ?? "general"} onChange={(e) => set("vatType", e.target.value as VatType)}><option value="general">General · 16%</option><option value="exento">Exento</option></select></div></div></Section>
                        {form && <Section icon={BadgeDollarSign} title="Precio de venta" description="Monto fijo o recargo dinámico sobre el costo promedio."><ProductSalePricingFields product={form} onChange={(salePricing) => set("salePricing", salePricing)} /></Section>}
                        {customFields.length > 0 && <Section icon={SlidersHorizontal} title="Campos adicionales" description="Datos específicos de tu sector o configuración."><div className="grid gap-4 md:grid-cols-3">{customFields.map((cf) => <BaseInput.Field key={cf.key} label={cf.label} value={String(form?.customFields?.[cf.key] ?? "")} onValueChange={(v) => setForm((current) => current ? { ...current, customFields: { ...(current.customFields ?? {}), [cf.key]: v || null } } : current)} />)}</div></Section>}
                        <Section icon={CheckCircle2} title="Estado" description="Los productos inactivos no aparecen en compras ni ventas."><label className="inline-flex cursor-pointer items-center gap-3"><input type="checkbox" checked={form?.active ?? false} onChange={(e) => set("active", e.target.checked)} className="size-4 accent-[var(--primary-500)]" /><span className="font-sans text-[13px] text-foreground">Producto activo</span></label></Section>
                        <Section icon={TrendingUp} title="Historial de compras y precios" description="Compara el costo de compra y el precio unitario efectivamente facturado, expresados en VES." className="!order-1">
                            {loadingProductHistory ? <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed border-border-light bg-surface-2 font-sans text-[13px] text-[var(--text-secondary)]">Cargando historial…</div> : <>
                                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-lg border border-border-light bg-surface-2 p-3"><p className={labelCls}>Última compra</p><p className="mt-1 font-sans text-[14px] font-semibold text-foreground">{productHistory?.latestPurchase ? new Date(`${productHistory.latestPurchase.date}T00:00:00`).toLocaleDateString("es-VE") : "Sin compras"}</p></div>
                                    <div className="rounded-lg border border-border-light bg-surface-2 p-3"><p className={labelCls}><Coins className="mr-1 inline size-3" />Costo original</p><p className="mt-1 font-sans text-[14px] font-semibold text-foreground">{productHistory?.latestPurchase ? `${productHistory.latestPurchase.currency} ${productHistory.latestPurchase.sourceAmount.toLocaleString("es-VE", { minimumFractionDigits: 2 })}` : "—"}</p></div>
                                    <div className="rounded-lg border border-border-light bg-surface-2 p-3"><p className={labelCls}><CalendarDays className="mr-1 inline size-3" />Costo en VES</p><p className="mt-1 font-sans text-[14px] font-semibold text-foreground">{productHistory?.latestPurchase ? `Bs. ${productHistory.latestPurchase.vesAmount.toLocaleString("es-VE", { minimumFractionDigits: 2 })}` : "—"}</p></div>
                                </div>
                                {productHistory ? <ProductHistoryChart points={productHistory.points} /> : <p className="font-sans text-[13px] text-[var(--text-secondary)]">No hay historial disponible.</p>}
                            </>}
                        </Section>
                    </>
                )}
            </main>
        </div>
    );
}
