"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, X } from "lucide-react";
import type { Product } from "@/src/modules/inventory/backend/domain/product";
import { callApi } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";

type ProductComponent = NonNullable<Product["components"]>[number];

interface CompositionResponse {
    components: ProductComponent[];
}

interface ProductCompositionEditorProps {
    companyId: string;
    product: Product;
    products: Product[];
    onSaved: () => Promise<void> | void;
}

/**
 * Edits the simple products and decimal quantities contained in a composite product.
 *
 * @param props - Product, company-scoped catalog, and refresh callback.
 * @returns The composition editor for an already-saved composite product.
 */
export function ProductCompositionEditor({ companyId, product, products, onSaved }: ProductCompositionEditorProps) {
    const [components, setComponents] = useState<ProductComponent[]>(product.components ?? []);
    const [selectedId, setSelectedId] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const eligibleProducts = useMemo(() => products
        .filter((candidate) => candidate.id && candidate.id !== product.id && candidate.companyId === product.companyId && candidate.active && candidate.compositionKind !== "composite")
        .sort((left, right) => left.name.localeCompare(right.name, "es")), [product.companyId, product.id, products]);

    useEffect(() => {
        let cancelled = false;
        if (!product.id || !companyId) return;
        setLoading(true);
        void callApi<CompositionResponse>(`/api/inventory/products/${encodeURIComponent(product.id)}/components?companyId=${encodeURIComponent(companyId)}`)
            .then((data) => { if (!cancelled && data) setComponents(data.components); })
            .catch(() => { if (!cancelled) notify.error("No se pudo cargar la composición."); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [companyId, product.id]);

    function addComponent() {
        const candidate = eligibleProducts.find((item) => item.id === selectedId);
        if (!candidate?.id || components.some((item) => item.productId === candidate.id)) return;
        const productId = candidate.id;
        setComponents((current) => [...current, {
            productId,
            quantity: 1,
            code: candidate.code,
            name: candidate.name,
            measureUnit: candidate.measureUnit,
            currentStock: candidate.currentStock,
            active: candidate.active,
        }]);
        setSelectedId("");
    }

    function updateQuantity(productId: string, quantity: number) {
        setComponents((current) => current.map((component) => component.productId === productId ? { ...component, quantity } : component));
    }

    async function saveComposition() {
        if (!product.id || saving) return;
        if (components.some((component) => !Number.isFinite(component.quantity) || component.quantity <= 0)) {
            notify.error("Cada componente debe tener una cantidad mayor que cero.");
            return;
        }
        setSaving(true);
        try {
            const saved = await callApi<CompositionResponse>(`/api/inventory/products/${encodeURIComponent(product.id)}/components`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, components: components.map(({ productId, quantity }) => ({ productId, quantity })) }),
                fallbackError: "No se pudo guardar la composición.",
            });
            if (!saved) return;
            setComponents(saved.components);
            notify.success("Composición guardada");
            await onSaved();
        } catch {
            notify.error("No se pudo guardar la composición.");
        } finally {
            setSaving(false);
        }
    }

    if (!product.id) return <p className="text-[13px] text-[var(--text-secondary)]">Guarda el producto antes de definir su composición.</p>;

    return <div className="space-y-4">
        <p className="text-[13px] text-[var(--text-secondary)]">Selecciona los productos simples y la cantidad de cada uno que contiene este producto.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
            <select aria-label="Producto componente" value={selectedId} disabled={loading || saving} onChange={(event) => setSelectedId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-border-default bg-surface-1 px-3 text-[13px] text-foreground disabled:opacity-50">
                <option value="">Seleccionar producto…</option>
                {eligibleProducts.filter((candidate) => !components.some((component) => component.productId === candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.code ? `${candidate.code} · ` : ""}{candidate.name}</option>)}
            </select>
            <button type="button" onClick={addComponent} disabled={!selectedId || loading || saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary-500 px-4 text-[12px] font-semibold text-primary-500 disabled:opacity-50"><Plus size={15} /> Agregar</button>
        </div>
        {loading ? <p className="py-4 text-center text-[13px] text-[var(--text-secondary)]">Cargando composición…</p> : components.length === 0 ? <p className="rounded-lg border border-dashed border-border-light p-4 text-center text-[13px] text-[var(--text-secondary)]">Aún no hay componentes. Este producto no podrá venderse hasta guardarlos.</p> : <div className="overflow-hidden rounded-lg border border-border-light">
            {components.map((component) => <div key={component.productId} className="grid grid-cols-[minmax(0,1fr)_112px_auto] items-center gap-3 border-b border-border-light px-3 py-3 last:border-b-0">
                <div className="min-w-0"><p className="truncate text-[13px] font-medium text-foreground">{component.name}</p><p className="mt-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">{component.code || "Sin código"} · Existencia {component.currentStock.toLocaleString("es-VE", { maximumFractionDigits: 4 })} {component.measureUnit}</p></div>
                <label className="sr-only" htmlFor={`component-quantity-${component.productId}`}>Cantidad de {component.name}</label><input id={`component-quantity-${component.productId}`} disabled={loading || saving} type="number" min="0.0001" step="0.0001" value={component.quantity} onChange={(event) => updateQuantity(component.productId, Number(event.target.value))} className="h-9 rounded-lg border border-border-default bg-surface-1 px-2 text-right font-mono text-[13px] text-foreground disabled:opacity-50" />
                <button type="button" disabled={loading || saving} onClick={() => setComponents((current) => current.filter((item) => item.productId !== component.productId))} className="flex size-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50" aria-label={`Quitar ${component.name}`}><X size={15} /></button>
            </div>)}
        </div>}
        <div className="flex justify-end"><button type="button" onClick={saveComposition} disabled={saving || loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-500 px-4 text-[12px] font-semibold text-white disabled:opacity-50"><Save size={14} />{saving ? "Guardando…" : "Guardar composición"}</button></div>
    </div>;
}
