"use client";

import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle, FileUp, LoaderCircle, RotateCcw, Save, Send, Upload } from "lucide-react";
import { GuidedStepperHeader } from "@/src/modules/payroll/frontend/components/guided/guided-stepper-header";
import { GuidedStepShell, StepSection } from "@/src/modules/payroll/frontend/components/guided/guided-step-shell";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import type { PurchaseImportSession } from "../hooks/use-purchase-import";
import type { PurchaseCsvImportBatch } from "../../backend/domain/repository/purchase-csv-import.repository";
import { calculatePurchaseCsvRow, getPurchaseCsvVatDefault, normalizePurchaseRif, type PurchaseCsvImportRow, type PurchaseCsvItem, type PurchaseCsvProductResolution } from "../../backend/domain/purchase-csv-import";
import type { Product, MeasureUnit, ValuationMethod } from "@/src/modules/inventory/backend/domain/product";
import type { VatRate, PurchaseInvoice } from "../../backend/domain/purchase-invoice";
import type { Supplier } from "../../backend/domain/supplier";

const STEPS = ["Compras", "Productos", "Configuración", "Previsualización", "Importar"].map((label, index) => ({ id: index + 1, label }));
const fmt = (value: string | number) => Number(value).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fieldClass = "w-full rounded-lg border border-border-medium bg-surface-1 p-2 text-sm";
const units: MeasureUnit[] = ["unidad", "kg", "g", "m", "m2", "m3", "litro", "galon", "caja", "rollo", "paquete"];
type NewProduct = NonNullable<PurchaseCsvProductResolution["create"]>;
type Defaults = { measureUnit?: MeasureUnit; valuationMethod?: ValuationMethod };
type Props = {
    session: PurchaseImportSession | null;
    loading: boolean;
    error: string | null;
    companyId?: string;
    batch: PurchaseCsvImportBatch | null;
    products: Product[];
    suppliers: Supplier[];
    purchaseInvoices: PurchaseInvoice[];
    defaults?: Defaults;
    onFiles: (stage: "headers" | "details", files: File[]) => void;
    onUpdate: (payload: Record<string, unknown>) => Promise<unknown>;
    onExecute: (mode: "draft" | "confirm") => void;
    onReset: () => void;
    /** Limits the session to one already-created imported draft. */
    targetInvoiceId?: string;
};

function CsvUpload({ multiple, disabled, onFiles }: { multiple?: boolean; disabled: boolean; onFiles: (files: File[]) => void }) {
    const input = useRef<HTMLInputElement>(null);
    return (
        <div className="rounded-xl border-2 border-dashed border-border-medium bg-surface-1 p-6 text-center">
            <FileUp className="mx-auto mb-3 text-primary-500" size={30} aria-hidden />
            <p className="text-sm">{multiple ? "Selecciona los archivos de productos de tus compras" : "Selecciona el listado de compras"}</p>
            <input ref={input} className="sr-only" aria-label={multiple ? "CSV de productos" : "CSV de compras"} type="file" accept=".csv,text/csv" multiple={multiple} disabled={disabled}
                onChange={event => { onFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
            <BaseButton.Root className="mt-4" variant="secondary" size="sm" isDisabled={disabled} onClick={() => input.current?.click()} leftIcon={<Upload size={14} />}>Seleccionar CSV</BaseButton.Root>
        </div>
    );
}

function PurchaseRows({ rows, existingStatuses = new Map(), onToggle }: { rows: PurchaseCsvImportRow[]; existingStatuses?: Map<number, "borrador" | "confirmada">; onToggle?: (key: number, selected: boolean) => void }) {
    return (
        <div className="overflow-x-auto rounded-lg border border-border-light">
            <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-surface-2"><tr>
                    {onToggle && <th className="p-3">Importar</th>}
                    {["Documento / control", "Proveedor", "Fecha", "Moneda / tasa", "Total Bs.", "Productos"].map(label => <th className="p-3" key={label}>{label}</th>)}
                </tr></thead>
                <tbody>{rows.map(row => (
                    <tr key={row.header.sourceRow} className="border-t border-border-light">
                        {onToggle && <td className="p-3"><input type="checkbox" aria-label={`Importar ${row.header.documentNumber}`} disabled={row.invoiceStatus === "confirmada" || existingStatuses.get(row.header.sourceRow) === "confirmada"} checked={row.selected} onChange={event => onToggle(row.header.sourceRow, event.target.checked)} /></td>}
                        <td className="p-3">{row.header.documentNumber}<span className="block text-[var(--text-tertiary)]">{row.header.controlNumber}</span></td>
                        <td className="p-3">{row.header.supplierName}<span className="block text-[var(--text-tertiary)]">{row.header.supplierRif}</span></td>
                        <td className="p-3">{row.header.date}</td>
                        <td className="p-3">{row.header.currency} · {row.header.exchangeRate}</td>
                        <td className="p-3 tabular-nums">{fmt(row.header.totalBs)}</td>
                        <td className="p-3">{row.invoiceStatus === "confirmada" || existingStatuses.get(row.header.sourceRow) === "confirmada" ? "Ya confirmada · se omitirá" : existingStatuses.get(row.header.sourceRow) === "borrador" ? "Actualizar borrador" : row.items.length ? `${row.items.length} renglones` : "Pendiente de detalle"}</td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
    );
}

function newProduct(item: PurchaseCsvItem, mapping: Record<string, VatRate>, defaults: Defaults): NewProduct {
    return {
        name: item.description,
        measureUnit: defaults.measureUnit ?? "unidad",
        valuationMethod: defaults.valuationMethod ?? "promedio_ponderado",
        vatType: mapping[item.saleVatCode] === "exenta" ? "exento" : "general",
    };
}

function NewProductEditor({ initial, item, onSave }: { initial: NewProduct; item: PurchaseCsvItem; onSave: (value: NewProduct) => void }) {
    const [form, setForm] = useState(initial);
    const [price, setPrice] = useState(initial.salePricing?.mode === "fixed" ? String(initial.salePricing.amount) : "");
    const [currency, setCurrency] = useState(initial.salePricing?.currency ?? item.currency);
    const priceValue = Number(price.replace(",", "."));
    const valid = form.name.trim() && (!price || (Number.isFinite(priceValue) && priceValue > 0)) && /^[A-Z]{3}$/.test(currency);
    return (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs">Nombre<input className={fieldClass} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
            <label className="text-xs">Unidad<select className={fieldClass} value={form.measureUnit} onChange={event => setForm({ ...form, measureUnit: event.target.value as MeasureUnit })}>{units.map(unit => <option key={unit}>{unit}</option>)}</select></label>
            <label className="text-xs">Valuación<select className={fieldClass} value={form.valuationMethod} onChange={event => setForm({ ...form, valuationMethod: event.target.value as ValuationMethod })}><option value="promedio_ponderado">Promedio ponderado</option><option value="peps">PEPS</option></select></label>
            <label className="text-xs">IVA de venta<select className={fieldClass} value={form.vatType} onChange={event => setForm({ ...form, vatType: event.target.value as Product["vatType"] })}><option value="general">General</option><option value="exento">Exento</option></select></label>
            <label className="text-xs">Precio de venta opcional<input className={fieldClass} inputMode="decimal" value={price} placeholder={`Referencia CSV: ${item.salePrice}`} onChange={event => setPrice(event.target.value)} /></label>
            <label className="text-xs">Moneda del precio<input className={fieldClass} value={currency} maxLength={3} onChange={event => setCurrency(event.target.value.toUpperCase())} /></label>
            <BaseButton.Root size="sm" variant="secondary" isDisabled={!valid} onClick={() => onSave({ ...form, name: form.name.trim(), salePricing: price ? { mode: "fixed", amount: priceValue, currency } : undefined })}>Guardar datos del producto nuevo</BaseButton.Root>
        </div>
    );
}

function CatalogResolution({ batch, rows, products, suppliers, defaults, onUpdate }: { batch: PurchaseCsvImportBatch; rows: PurchaseCsvImportRow[]; products: Product[]; suppliers: Supplier[]; defaults: Defaults; onUpdate: Props["onUpdate"] }) {
    return (
        <div className="space-y-4">
            {rows.map(row => {
                const supplierMatches = suppliers.filter(supplier => normalizePurchaseRif(supplier.rif) === normalizePurchaseRif(row.header.supplierRif));
                return <div key={row.header.sourceRow} className="rounded-lg border border-border-light p-4">
                    <p className="mb-2 text-sm font-semibold">Compra {row.header.documentNumber}</p>
                    <label className="block text-xs">Proveedor
                        <select className={fieldClass} value={row.supplierId ?? ""} onChange={event => onUpdate({ suppliers: { [row.header.sourceRow]: event.target.value } })}>
                            <option value="">{supplierMatches.length ? "Selecciona el proveedor coincidente" : `Crear ${row.header.supplierName} al importar`}</option>
                            {supplierMatches.map(supplier => <option key={supplier.id} value={supplier.id} disabled={!supplier.active}>{supplier.name}{!supplier.active ? " (inactivo)" : ""}</option>)}
                        </select>
                    </label>
                    {[...new Map(row.items.map(item => [item.code, item])).values()].map(item => {
                        const matches = products.filter(product => product.code === item.code);
                        const resolution = row.productResolutions[item.code];
                        const saveResolution = (value: PurchaseCsvProductResolution) => onUpdate({ resolutions: { [row.header.sourceRow]: { ...row.productResolutions, [item.code]: value } } });
                        return <div key={item.code} className="mt-4 rounded-lg border border-border-light p-3">
                            <label className="text-xs">{item.code} · {item.description}
                                <select className={fieldClass} value={resolution?.productId ?? (resolution?.create ? "__new" : "")} onChange={event => saveResolution(event.target.value === "__new" ? { create: newProduct(item, (row.configOverride ?? batch.config).vatMappings, defaults) } : { productId: event.target.value })}>
                                    <option value="" disabled>Selecciona una coincidencia o crea el producto</option>
                                    {!matches.length && <option value="__new">Crear producto nuevo</option>}
                                    {matches.map(product => <option key={product.id} value={product.id} disabled={!product.active}>{product.name}{!product.active ? " (inactivo)" : ""}</option>)}
                                </select>
                            </label>
                            {resolution?.create && <NewProductEditor key={`${batch.id}:${item.code}:${row.header.sourceRow}`} initial={resolution.create} item={item} onSave={value => saveResolution({ create: value })} />}
                            <details className="mt-2 text-xs text-[var(--text-tertiary)]"><summary className="cursor-pointer">Referencias del CSV</summary><p className="mt-2">Existencia: {item.sourceStock} · Precio 1: {item.salePrice} {item.currency} · Porcentaje: {item.markupPercent}% · IVA venta: {item.saleVatCode} · Costo full Bs.: {item.fullCostBs} · Costo *: {item.currencyCost} · Subtotal *: {item.currencySubtotal} · Costo full *: {item.currencyFullCost}</p></details>
                        </div>;
                    })}
                </div>;
            })}
        </div>
    );
}

/**
 * Presents staged purchases as five revisitable steps with explicit fiscal review.
 * @param props - Persisted batch, catalogs and company-scoped actions owned by the import hook.
 * @returns Responsive wizard; only the final execution actions create invoices or stock movements.
 */
export function PurchaseImportWizard({ session, batch, products, suppliers, purchaseInvoices, defaults = {}, loading, error, companyId, onFiles, onUpdate, onExecute, onReset, targetInvoiceId }: Props) {
    const targetMode = Boolean(targetInvoiceId);
    const [step, setStep] = useState(targetMode ? 2 : 1);
    const visibleSteps = targetMode ? STEPS.slice(1).map((entry, index) => ({ ...entry, id: index + 1 })) : STEPS;
    const visibleStep = targetMode ? step - 1 : step;
    const existingStatuses = new Map((batch?.rows ?? []).flatMap(row => {
        const invoice = purchaseInvoices.find(invoice => {
            const supplier = suppliers.find(supplier => supplier.id === invoice.supplierId);
            return invoice.id !== row.invoiceId && invoice.invoiceNumber === row.header.documentNumber &&
                (invoice.controlNumber ?? "") === row.header.controlNumber && supplier &&
                normalizePurchaseRif(supplier.rif) === normalizePurchaseRif(row.header.supplierRif);
        });
        return invoice?.status ? [[row.header.sourceRow, invoice.status] as const] : [];
    }));
    const selected = batch?.rows.filter(row => row.selected && row.invoiceStatus !== "confirmada" && existingStatuses.get(row.header.sourceRow) !== "confirmada") ?? [];
    const allSelectedAreConfirmed = Boolean(batch && batch.rows.some(row => row.selected) && selected.length === 0);
    const results = batch ? selected.map(row => ({ row, calculation: calculatePurchaseCsvRow(row, row.configOverride ?? batch.config) })) : [];
    const complete = results.filter(result => result.calculation.complete);
    const taxCodes = [...new Set(selected.flatMap(row => row.items.flatMap(item => [item.purchaseVatCode, item.saleVatCode]).filter(Boolean)))];
    const proposedMappings: Record<string, VatRate> = { ...(batch?.config.vatMappings ?? {}) };
    for (const code of taxCodes) {
        const mapping = getPurchaseCsvVatDefault(code);
        if (mapping) proposedMappings[code] = mapping;
    }
    const unknownTaxCodes = taxCodes.filter(code => !getPurchaseCsvVatDefault(code));
    const applyUniqueMatches = async () => {
        if (!batch) return false;
        const resolutions: Record<string, PurchaseCsvImportRow["productResolutions"]> = {};
        const supplierIds: Record<string, string> = {};
        for (const row of selected) {
            const rowResolutions = { ...row.productResolutions };
            let rowChanged = false;
            for (const item of row.items) {
                const existing = rowResolutions[item.code];
                if (existing?.productId || existing?.create) continue;
                const matches = products.filter(product => product.code === item.code);
                if (matches.length === 1 && matches[0].active) {
                    rowResolutions[item.code] = { productId: matches[0].id };
                    rowChanged = true;
                }
            }
            if (rowChanged) resolutions[String(row.header.sourceRow)] = rowResolutions;
            const matches = suppliers.filter(supplier => normalizePurchaseRif(supplier.rif) === normalizePurchaseRif(row.header.supplierRif));
            if (!row.supplierId && matches.length === 1 && matches[0].active && matches[0].id) supplierIds[String(row.header.sourceRow)] = matches[0].id;
        }
        if (Object.keys(resolutions).length || Object.keys(supplierIds).length) return Boolean(await onUpdate({ resolutions, suppliers: supplierIds }));
        return true;
    };
    const nextStep = () => {
        if (step === 3) void applyUniqueMatches().then(saved => { if (saved) setStep(4); });
        else setStep(step + 1);
    };
    const shell = (title: string, subtitle: string, body: ReactNode, disabled = false) => (
        <GuidedStepShell title={title} subtitle={subtitle} onBack={step > (targetMode ? 2 : 1) ? () => setStep(step - 1) : undefined} onNext={nextStep} nextDisabled={disabled || loading}>{body}</GuidedStepShell>
    );
    if (!companyId) return <p className="p-6">Selecciona una empresa para importar compras.</p>;
    return <div className="flex min-h-full flex-col bg-background">
        <GuidedStepperHeader steps={visibleSteps} currentStep={visibleStep} onStepClick={next => { const actualStep = targetMode ? next + 1 : next; if (!loading && actualStep <= step) setStep(actualStep); }} />
        {error && <div role="alert" className="mx-auto mt-4 flex w-full max-w-4xl gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle size={16} />{error}</div>}
        {loading && <div role="status" aria-label="Procesando importación" className="fixed inset-0 z-50 grid place-items-center bg-background/60"><LoaderCircle className="animate-spin text-primary-500" /></div>}
        {!targetMode && step === 1 && (allSelectedAreConfirmed ? (
            <GuidedStepShell title="Compras ya importadas" subtitle="El archivo coincide con facturas que ya fueron confirmadas." hideNav>
                <StepSection title="Sin cambios pendientes"><p className="text-sm text-[var(--text-secondary)]">Todas las facturas ya están confirmadas; se omitieron.</p></StepSection>
                <BaseButton.Root variant="secondary" isDisabled={loading} onClick={() => { onReset(); setStep(1); }} leftIcon={<RotateCcw size={14} />}>Nueva importación</BaseButton.Root>
            </GuidedStepShell>
        ) : shell("Carga las compras", "Selecciona el listado y las compras que deseas importar.", <>
            <StepSection title="Listado de compras"><CsvUpload disabled={loading || !!batch} onFiles={files => onFiles("headers", files)} />
                {batch && <div className="mt-4 space-y-3"><p className="text-sm">{batch.fileName} · RIF {batch.companyRif}</p><PurchaseRows rows={batch.rows} existingStatuses={existingStatuses} onToggle={(key, selected) => onUpdate({ selections: [{ key: String(key), selected }] })} /></div>}
            </StepSection>
        </>, !batch || !selected.length))}
        {step === 2 && shell("Relaciona los productos", "Cada archivo se asocia por documento, ID de proveedor y fecha.", <>
            <StepSection title="Archivos de productos" description="Puedes continuar sin todos los detalles y guardar las compras pendientes como borradores."><CsvUpload multiple disabled={loading || (targetMode && !batch)} onFiles={files => onFiles("details", files)} /></StepSection>
            <StepSection title="Compras seleccionadas"><PurchaseRows rows={selected} />
                <div className="mt-3 flex flex-wrap gap-2">{selected.filter(row => row.items.length).map(row => <BaseButton.Root key={row.header.sourceRow} variant="ghost" size="sm" onClick={() => onUpdate({ clearDetails: row.header.sourceRow })}>Quitar detalle de {row.header.documentNumber} para reemplazar</BaseButton.Root>)}</div>
            </StepSection>
        </>, !batch)}
        {step === 3 && shell("Configura la importación", "Revisa los costos, las equivalencias de IVA y los productos.", <>
            <StepSection title="Costos e IVA">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={batch?.config.costsIncludeVat ?? false} onChange={event => { void onUpdate({ costIncludesVat: event.target.checked, taxMappings: proposedMappings }); }} />Los costos incluyen IVA</label>
                <p className="mt-4 text-sm text-[var(--text-secondary)]">IVA: 16% · Exento: 0%</p>
                {unknownTaxCodes.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{unknownTaxCodes.map(code => <label className="text-xs" key={code}>{code}<select className={fieldClass} value={proposedMappings[code] ?? ""} onChange={event => { const next = { ...proposedMappings }; if (event.target.value) next[code] = event.target.value as VatRate; else delete next[code]; void onUpdate({ costIncludesVat: batch?.config.costsIncludeVat ?? false, taxMappings: next }); }}>
                    <option value="" disabled>Selecciona equivalencia</option><option value="exenta">Exento</option><option value="reducida_8">8%</option><option value="general_16">16%</option>
                </select></label>)}</div>}
            </StepSection>
            {batch && <StepSection title="Proveedores y productos" description="Los productos existentes conservan sus precios, IVA de venta y existencias."><CatalogResolution batch={batch} rows={selected} products={products} suppliers={suppliers} defaults={defaults} onUpdate={onUpdate} /></StepSection>}
        </>, !batch || unknownTaxCodes.some(code => !proposedMappings[code]))}
        {step === 4 && shell("Previsualiza las compras", "Se usará el total calculado y se conservará el original como referencia.", <>
            {results.map(({ row, calculation }) => <StepSection key={row.header.sourceRow} title={`Compra ${row.header.documentNumber}`} description={`${row.header.supplierName} · ${row.header.currency} · tasa ${row.header.exchangeRate}`}>
                <div className="grid gap-3 text-sm sm:grid-cols-3"><p>Total original<strong className="block">Bs. {fmt(row.header.totalBs)}</strong></p><p>Total calculado<strong className="block">{calculation.complete ? `Bs. ${fmt(calculation.total)}` : "Pendiente de revisión"}</strong></p><p>Diferencia<strong className="block">{calculation.complete ? `Bs. ${fmt(calculation.difference)}` : "—"}</strong></p></div>
                {calculation.errors.length > 0 && <ul className="mt-3 list-inside list-disc text-sm text-red-700">{calculation.errors.map((message, index) => <li key={index}>{message}</li>)}</ul>}
                {!row.items.length && <p className="mt-3 text-sm">Falta el archivo de productos. Se guardará como borrador.</p>}
                {calculation.complete && calculation.difference !== "0" && <p className="mt-4 text-sm">Se usará el total calculado de esta compra. El total original se conservará como referencia.</p>}
                {row.items.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr>{["Código / detalle", "Cantidad", "Costo Bs.", "Subtotal Bs.", "IVA", "Moneda / tasa"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{row.items.map((item, index) => <tr className="border-t border-border-light" key={`${item.sourceRow}:${index}`}><td className="p-2">{item.code}<span className="block">{item.description}</span></td><td className="p-2">{item.quantity}</td><td className="p-2">{fmt(item.unitCostBs)}</td><td className="p-2">{fmt(item.subtotalBs)}</td><td className="p-2">{item.purchaseVatCode}</td><td className="p-2">{item.currency} · {item.exchangeRate}</td></tr>)}</tbody></table></div>}
            </StepSection>)}
        </>, !selected.length)}
        {step === 5 && <GuidedStepShell title="Importa las compras" subtitle="Elige guardar borradores o confirmar las compras completas." onBack={() => setStep(4)} hideNav>
            <StepSection title="Resultado esperado"><p className="text-sm">{complete.length} compras completas, {selected.filter(row => !row.items.length).length} pendientes de detalle y {results.filter(result => result.calculation.errors.length > 0).length} con errores que deben corregirse.</p><p className="mt-2 text-sm">Confirmar aumenta el inventario por las cantidades compradas. Las compras sin detalle quedan como borradores.</p></StepSection>
            <div className="flex flex-wrap gap-3"><BaseButton.Root variant="secondary" isDisabled={loading || !selected.length} onClick={() => onExecute("draft")} leftIcon={<Save size={16} />}>{targetMode ? "Guardar borrador" : "Guardar borradores"}</BaseButton.Root><BaseButton.Root isDisabled={loading || !complete.length} onClick={() => onExecute("confirm")} leftIcon={<Send size={16} />}>{targetMode ? "Confirmar factura" : "Importar y confirmar completas"}</BaseButton.Root>{!targetMode && <BaseButton.Root variant="ghost" isDisabled={loading} onClick={() => { onReset(); setStep(1); }} leftIcon={<RotateCcw size={14} />}>Nueva importación</BaseButton.Root>}</div>
            {session?.results && <StepSection title="Resultados"><ul className="space-y-2 text-sm">{session.results.map((result, index) => <li key={index} className={result.status === "failed" ? "text-red-700" : "text-emerald-700"}>{result.purchaseKey}: {result.status === "confirmed" ? "Confirmada" : result.status === "saved" ? "Borrador guardado" : result.status === "skipped" ? "Ya confirmada · omitida" : "No importada"}{result.message ? ` · ${result.message}` : ""}</li>)}</ul><p className="mt-3 text-xs">Puedes reintentar: las compras confirmadas no se duplican.</p></StepSection>}
        </GuidedStepShell>}
    </div>;
}
