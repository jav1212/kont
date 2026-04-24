"use client";

// Page: NuevaFacturaPage
// Purpose: Create a new purchase invoice (factura de compra) with line items.
// Architectural role: Page-level composition using inventory hook and shared domain types.
// All identifiers use English domain types; JSX user-facing text remains in Spanish.

import { useEffect, useState, useCallback, useRef } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { PurchaseInvoice, PurchaseInvoiceItem } from "@/src/modules/inventory/backend/domain/purchase-invoice";
import { FacturaItemsGrid, emptyItem } from "@/src/modules/inventory/frontend/components/factura-items-grid";
import type { ProductType, VatType } from "@/src/modules/inventory/backend/domain/product";

const fmtTasa = (n: number | null) =>
    n == null ? "" : String(n);

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const todayStr = () => getTodayIsoDate();

// ── QuickModal ────────────────────────────────────────────────────────────────

function QuickModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[440px] max-h-[85vh] overflow-y-auto bg-surface-1 rounded-xl border border-border-medium shadow-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[14px] font-bold uppercase tracking-[0.14em] text-foreground">{title}</h3>
                    <button
                        onClick={onClose}
                        className="w-6 h-6 flex items-center justify-center text-[var(--text-tertiary)] hover:text-foreground text-[16px] leading-none rounded transition-colors"
                    >
                        ×
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ── SupplierCombobox ──────────────────────────────────────────────────────────

interface SupplierComboboxProps {
    supplierId: string;
    suppliers: { id?: string; name: string; rif?: string; active?: boolean }[];
    onChange: (id: string) => void;
    onRequestCreate: (search: string) => void;
}

function SupplierCombobox({ supplierId, suppliers, onChange, onRequestCreate }: SupplierComboboxProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [hiIdx, setHiIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selected = suppliers.find((s) => s.id === supplierId);

    const filtered = suppliers
        .filter(
            (s) =>
                s.active !== false &&
                (s.name.toLowerCase().includes(search.toLowerCase()) ||
                    (s.rif ?? "").toLowerCase().includes(search.toLowerCase())),
        )
        .slice(0, 12);

    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.children[hiIdx] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
    }, [hiIdx]);

    function openDropdown() { setSearch(""); setHiIdx(0); setOpen(true); }
    function closeDropdown() { setOpen(false); setSearch(""); }
    function selectItem(id: string) { onChange(id); closeDropdown(); }

    function handleBlur(e: React.FocusEvent) {
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) closeDropdown();
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (open) {
            if (e.key === "ArrowDown") { e.preventDefault(); setHiIdx((i) => Math.min(i + 1, filtered.length - 1)); return; }
            if (e.key === "ArrowUp")   { e.preventDefault(); setHiIdx((i) => Math.max(i - 1, 0)); return; }
            if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[hiIdx]) selectItem(filtered[hiIdx].id!);
                return;
            }
            if (e.key === "Escape") { e.preventDefault(); closeDropdown(); return; }
        }
    }

    const displayValue = open
        ? search
        : selected
          ? [selected.rif, selected.name].filter(Boolean).join(" · ")
          : "";

    return (
        <div ref={wrapRef} className="relative flex-1" onBlur={handleBlur}>
            <BaseInput.Field
                value={displayValue}
                placeholder={open ? "Buscar proveedor…" : "Seleccionar proveedor…"}
                onValueChange={(v) => { setSearch(v); setHiIdx(0); }}
                onFocus={openDropdown}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck="false"
            />
            {open && (
                <div className="absolute left-0 top-full z-50 min-w-full mt-0.5 rounded-lg border border-border-medium bg-surface-1 shadow-xl overflow-hidden">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">Sin resultados</div>
                    ) : (
                        <ul ref={listRef} className="max-h-52 overflow-y-auto">
                            {filtered.map((s, i) => (
                                <li
                                    key={s.id}
                                    className={[
                                        "px-3 py-2 cursor-pointer flex items-center gap-2 text-[13px]",
                                        i === hiIdx ? "bg-primary-500/10 text-foreground" : "text-[var(--text-secondary)] hover:bg-surface-2",
                                    ].join(" ")}
                                    onMouseDown={(e) => { e.preventDefault(); selectItem(s.id!); }}
                                    onMouseEnter={() => setHiIdx(i)}
                                >
                                    {s.rif && (
                                        <span className="font-mono text-[11px] text-[var(--text-tertiary)] min-w-[80px]">{s.rif}</span>
                                    )}
                                    <span className="truncate">{s.name}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <button
                        className="w-full px-3 py-2 text-left text-[12px] text-primary-500 hover:bg-primary-500/[0.06] border-t border-border-light/50 transition-colors"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            onRequestCreate(search);
                            closeDropdown();
                        }}
                    >
                        + Crear{search ? ` "${search}"` : ' nuevo proveedor'}
                    </button>
                </div>
            )}
        </div>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function NuevaFacturaPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const {
        products, loadProducts,
        suppliers, loadSuppliers,
        loadPeriodCloses,
        currentDollarRate,
        error, setError,
        savePurchaseInvoice, confirmPurchaseInvoice,
        saveSupplier,
        saveProduct,
        departments, loadDepartments,
        saveDepartment,
    } = useInventory();

    // Form state
    const [supplierId, setSupplierId] = useState("");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [controlNumber, setControlNumber] = useState("");
    const [date, setDate] = useState(todayStr());
    const [notes, setNotes] = useState("");
    const [dollarRate, setDollarRate] = useState<string>("");
    const [rateDateBcv, setRateDateBcv] = useState<string | null>(null);
    const [rateLoading, setRateLoading] = useState(false);
    const [rateError, setRateError] = useState<string | null>(null);
    const [items, setItems] = useState<PurchaseInvoiceItem[]>([emptyItem()]);

    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    // Quick-create state
    const [qcMode, setQcMode] = useState<'supplier' | 'product' | null>(null);
    const [qcSaving, setQcSaving] = useState(false);

    // Quick create supplier form
    const [qcSupplier, setQcSupplier] = useState({ name: '', rif: '' });

    // Quick create product form
    const [qcProduct, setQcProduct] = useState({ name: '', code: '', type: 'mercancia' as ProductType, vatType: 'general' as VatType, departmentId: '' });
    // Quick create department (nested inside product modal)
    const [qcDeptName, setQcDeptName] = useState('');
    const [qcDeptOpen, setQcDeptOpen] = useState(false);
    const [qcDeptSaving, setQcDeptSaving] = useState(false);

    useEffect(() => {
        if (companyId) {
            loadProducts(companyId);
            loadSuppliers(companyId);
            loadPeriodCloses(companyId);
            loadDepartments(companyId);
        }
    }, [companyId, loadProducts, loadSuppliers, loadPeriodCloses, loadDepartments]);

    // Pre-fill rate from last period close when closes load (only if BCV hasn't filled it)
    useEffect(() => {
        if (currentDollarRate != null && dollarRate === "" && !rateLoading) {
            setDollarRate(fmtTasa(currentDollarRate));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDollarRate]);

    // Auto-fetch BCV rate when date changes
    useEffect(() => {
        if (!date) return;
        let cancelled = false;
        setRateLoading(true);
        setRateError(null);
        fetch(`/api/bcv/rate?date=${date}&code=USD`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                if (json.rate) {
                    setDollarRate(String(json.rate));
                    setRateDateBcv(json.date);
                } else {
                    setRateError(json.error ?? "Sin datos BCV para esta fecha");
                    setRateDateBcv(null);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setRateError("Error al consultar BCV");
                    setRateDateBcv(null);
                }
            })
            .finally(() => { if (!cancelled) setRateLoading(false); });
        return () => { cancelled = true; };
    }, [date]);

    // Derived totals — computed per-item from vatRate
    const subtotal      = items.reduce((acc, i) => acc + (i.totalCost ?? 0), 0);
    const baseExempt    = items.filter(i => (i.vatRate ?? "general_16") === "exenta").reduce((acc, i) => acc + i.totalCost, 0);
    const baseTaxed8    = items.filter(i => (i.vatRate ?? "general_16") === "reducida_8").reduce((acc, i) => acc + i.totalCost, 0);
    const baseTaxed16   = items.filter(i => (i.vatRate ?? "general_16") === "general_16").reduce((acc, i) => acc + i.totalCost, 0);
    const vat8          = Math.round(baseTaxed8  * 8  / 100 * 100) / 100;
    const vat16         = Math.round(baseTaxed16 * 16 / 100 * 100) / 100;
    const vatAmount     = vat8 + vat16;
    const total         = subtotal + vatAmount;

    const buildInvoice = useCallback((): PurchaseInvoice => ({
        companyId:     companyId!,
        supplierId,
        invoiceNumber,
        controlNumber,
        date,
        period:        date.slice(0, 7),
        status:        "borrador",
        subtotal,
        vatPercentage: 0,
        vatAmount,
        total,
        notes,
    }), [companyId, supplierId, invoiceNumber, controlNumber, date, subtotal, vatAmount, total, notes]);

    function validate(): boolean {
        if (!supplierId) { setError("Selecciona un proveedor"); return false; }
        if (items.length === 0) { setError("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productId) { setError("Selecciona un producto en cada fila"); return false; }
            if (item.quantity <= 0) { setError("La cantidad debe ser mayor a 0"); return false; }
        }
        return true;
    }

    async function handleSaveDraft() {
        if (!validate()) return;
        setSaving(true);
        setError(null);
        const invoice = buildInvoice();
        if (savedId) invoice.id = savedId;
        const saved = await savePurchaseInvoice(invoice, items);
        setSaving(false);
        if (saved?.id) setSavedId(saved.id);
    }

    async function handleConfirm() {
        if (!validate()) return;
        setConfirming(true);
        setError(null);
        // First save draft (or update existing)
        const invoice = buildInvoice();
        if (savedId) invoice.id = savedId;
        const saved = await savePurchaseInvoice(invoice, items);
        if (!saved) { setConfirming(false); return; }
        // Then confirm
        const confirmedInvoice = await confirmPurchaseInvoice(saved.id!);
        setConfirming(false);
        if (confirmedInvoice) {
            setConfirmed(true);
            setSavedId(confirmedInvoice.id!);
        }
    }

    async function handleQcSupplier() {
        if (!qcSupplier.name.trim()) { setError('El nombre es requerido'); return; }
        setQcSaving(true);
        const saved = await saveSupplier({ companyId: companyId!, name: qcSupplier.name.trim(), rif: qcSupplier.rif.trim(), contact: '', phone: '', email: '', address: '', notes: '', active: true });
        setQcSaving(false);
        if (saved) {
            setSupplierId(saved.id!);
            setQcMode(null);
            setQcSupplier({ name: '', rif: '' });
        }
    }

    async function handleQcDepartment() {
        if (!qcDeptName.trim()) return;
        setQcDeptSaving(true);
        const saved = await saveDepartment({ companyId: companyId!, name: qcDeptName.trim(), description: '', active: true });
        setQcDeptSaving(false);
        if (saved) {
            setQcProduct(p => ({ ...p, departmentId: saved.id! }));
            setQcDeptName('');
            setQcDeptOpen(false);
        }
    }

    async function handleQcProduct() {
        if (!qcProduct.name.trim()) { setError('El nombre del producto es requerido'); return; }
        setQcSaving(true);
        const saved = await saveProduct({
            companyId: companyId!,
            name: qcProduct.name.trim(),
            code: qcProduct.code.trim(),
            description: '',
            type: qcProduct.type,
            measureUnit: 'unidad',
            valuationMethod: 'promedio_ponderado',
            currentStock: 0,
            averageCost: 0,
            active: true,
            vatType: qcProduct.vatType,
            departmentId: qcProduct.departmentId || undefined,
        });
        setQcSaving(false);
        if (saved) {
            setQcMode(null);
            setQcProduct({ name: '', code: '', type: 'mercancia', vatType: 'general', departmentId: '' });
        }
    }

    if (confirmed && savedId) {
        const period = date.slice(0, 7);
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                    <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                        Nueva Factura de Compra
                    </h1>
                </div>
                <div className="px-8 py-10 flex flex-col items-center gap-6">
                    <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] px-8 py-8 text-center max-w-md w-full">
                        <div className="text-green-500 text-[13px] font-bold uppercase tracking-[0.12em] mb-2">
                            Factura confirmada
                        </div>
                        <p className="text-[var(--text-secondary)] text-[13px] mb-6">
                            Las entradas de inventario han sido registradas exitosamente.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                onClick={() => router.push("/inventory/purchases")}
                            >
                                Ver facturas
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={() => router.push(`/inventory/movements?periodo=${period}`)}
                            >
                                Ver movimientos
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Nueva Factura de Compra" subtitle="Registrar compra a proveedor">
                <BaseButton.Root variant="secondary" size="md" onClick={() => router.back()}>
                    ← Volver
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6">
                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                        {error}
                    </div>
                )}

                <div className="flex gap-6 items-start">
                    {/* Left panel — form (2/3) */}
                    <div className="flex-1 min-w-0 space-y-4">

                        {/* Datos de la factura */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                            <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-5">
                                Datos de la factura
                            </h2>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className={labelCls}>Proveedor *</label>
                                    <div className="flex gap-2">
                                        <SupplierCombobox
                                            supplierId={supplierId}
                                            suppliers={suppliers}
                                            onChange={setSupplierId}
                                            onRequestCreate={(search) => {
                                                setQcSupplier(s => ({ ...s, name: search }));
                                                setQcMode('supplier');
                                                setError(null);
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { setQcSupplier({ name: '', rif: '' }); setQcMode('supplier'); setError(null); }}
                                            className="h-10 px-3 shrink-0 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-text-tertiary hover:text-foreground text-[16px] leading-none transition-colors"
                                            title="Crear nuevo proveedor"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                                <BaseInput.Field
                                    label="Nº Factura"
                                    value={invoiceNumber}
                                    onValueChange={setInvoiceNumber}
                                    placeholder="Ej. 0001-00123456"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <BaseInput.Field
                                    label="Nº Control"
                                    value={controlNumber}
                                    onValueChange={setControlNumber}
                                    placeholder="Ej. 00-00123456"
                                />
                                <BaseInput.Field
                                    label="Fecha"
                                    type="date"
                                    value={date}
                                    onValueChange={setDate}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <BaseInput.Field
                                        label="Tasa BCV (Bs/USD)"
                                        type="number"
                                        min={0}
                                        step={0.0001}
                                        value={dollarRate}
                                        onValueChange={(v) => { setDollarRate(v); setRateDateBcv(null); }}
                                        placeholder={rateLoading ? "Consultando BCV…" : "Ej. 46.50"}
                                        isDisabled={rateLoading}
                                        endContent={rateLoading ? (
                                            <span className="text-[11px] text-[var(--text-tertiary)] animate-pulse">···</span>
                                        ) : undefined}
                                    />
                                    {rateDateBcv && !rateLoading && (
                                        <p className="mt-1 text-[11px] text-green-500 uppercase tracking-[0.12em]">
                                            BCV {rateDateBcv}
                                        </p>
                                    )}
                                    {rateError && !rateLoading && (
                                        <p className="mt-1 text-[11px] text-amber-500 uppercase tracking-[0.10em]">
                                            {rateError} — ingresa manualmente
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Notas</label>
                                <textarea
                                    className={`${fieldCls} h-auto py-2`}
                                    rows={2}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Productos */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
                                    Productos
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => { setQcMode('product'); setError(null); }}
                                    className="h-8 px-3 text-[11px] uppercase tracking-[0.12em] rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                                >
                                    + Nuevo producto
                                </button>
                            </div>

                            <FacturaItemsGrid
                                items={items}
                                products={products}
                                onChange={setItems}
                                dollarRate={dollarRate ? parseFloat(dollarRate.replace(",", ".")) || null : null}
                                onRequestCreateProduct={(search) => {
                                    setQcProduct(p => ({ ...p, name: search }));
                                    setQcMode('product');
                                    setError(null);
                                }}
                            />

                            {/* Totals row */}
                            <div className="mt-4 pt-4 border-t border-border-light flex flex-col items-end gap-1.5 text-[13px]">
                                <div className="flex gap-8 items-center">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Subtotal</span>
                                    <span className="tabular-nums font-medium text-[var(--text-primary)] w-32 text-right">{fmtN(subtotal)}</span>
                                </div>
                                {baseExempt > 0 && (
                                    <div className="flex gap-8 items-center">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Base exenta</span>
                                        <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(baseExempt)}</span>
                                    </div>
                                )}
                                {baseTaxed8 > 0 && (
                                    <>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Base gravada 8%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(baseTaxed8)}</span>
                                        </div>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA 8%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(vat8)}</span>
                                        </div>
                                    </>
                                )}
                                {baseTaxed16 > 0 && (
                                    <>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Base gravada 16%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(baseTaxed16)}</span>
                                        </div>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA 16%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(vat16)}</span>
                                        </div>
                                    </>
                                )}
                                {vatAmount > 0 && (
                                    <div className="flex gap-8 items-center">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Total IVA</span>
                                        <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(vatAmount)}</span>
                                    </div>
                                )}
                                <div className="flex gap-8 items-center border-t border-border-light pt-1.5">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Total</span>
                                    <span className="tabular-nums font-bold text-foreground w-32 text-right">{fmtN(total)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={handleSaveDraft}
                                disabled={saving || confirming}
                            >
                                {saving ? "Guardando…" : "Guardar borrador"}
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                onClick={handleConfirm}
                                disabled={saving || confirming}
                            >
                                {confirming ? "Confirmando…" : "Confirmar factura"}
                            </BaseButton.Root>
                            {savedId && !confirmed && (
                                <span className="text-[11px] text-green-500 uppercase tracking-[0.12em]">
                                    Borrador guardado
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right panel — summary (1/3) */}
                    <div className="w-72 flex-shrink-0 sticky top-6">
                        <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-4">
                            <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                Resumen
                            </h3>
                            <div className="space-y-3 text-[13px]">
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Proveedor</span>
                                    <span className="text-foreground font-medium truncate ml-4 text-right">
                                        {supplierId
                                            ? suppliers.find((s) => s.id === supplierId)?.name ?? "—"
                                            : "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Fecha</span>
                                    <span className="text-foreground tabular-nums">{date || "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Ítems</span>
                                    <span className="text-foreground tabular-nums">{items.filter((i) => i.productId).length}</span>
                                </div>
                            </div>
                            <div className="pt-3 border-t border-border-light space-y-2 text-[13px]">
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Subtotal</span>
                                    <span className="tabular-nums text-[var(--text-primary)]">{fmtN(subtotal)}</span>
                                </div>
                                {vat8 > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA 8%</span>
                                        <span className="tabular-nums text-amber-600">{fmtN(vat8)}</span>
                                    </div>
                                )}
                                {vat16 > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA 16%</span>
                                        <span className="tabular-nums text-[var(--text-secondary)]">{fmtN(vat16)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold">
                                    <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[11px]">Total</span>
                                    <span className="tabular-nums text-foreground">{fmtN(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick-create: Supplier */}
            {qcMode === 'supplier' && (
                <QuickModal title="Nuevo Proveedor" onClose={() => setQcMode(null)}>
                    <div className="space-y-3">
                        <BaseInput.Field
                            autoFocus
                            label="Nombre *"
                            value={qcSupplier.name}
                            onValueChange={(v) => setQcSupplier(s => ({ ...s, name: v }))}
                            placeholder="Nombre del proveedor"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleQcSupplier(); }}
                        />
                        <BaseInput.Field
                            label="RIF"
                            value={qcSupplier.rif}
                            onValueChange={(v) => setQcSupplier(s => ({ ...s, rif: v }))}
                            placeholder="J-12345678-9"
                        />
                        {error && <p className="text-[13px] text-red-500">{error}</p>}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setQcMode(null)}
                                className="flex-1 h-9 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleQcSupplier}
                                disabled={qcSaving}
                                className="flex-1 h-9 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                {qcSaving ? 'Guardando…' : 'Crear proveedor'}
                            </button>
                        </div>
                    </div>
                </QuickModal>
            )}

            {/* Quick-create: Product */}
            {qcMode === 'product' && (
                <QuickModal title="Nuevo Producto" onClose={() => setQcMode(null)}>
                    <div className="space-y-3">
                        <BaseInput.Field
                            autoFocus
                            label="Nombre *"
                            value={qcProduct.name}
                            onValueChange={(v) => setQcProduct(p => ({ ...p, name: v }))}
                            placeholder="Nombre del producto"
                        />
                        <BaseInput.Field
                            label="Código"
                            value={qcProduct.code}
                            onValueChange={(v) => setQcProduct(p => ({ ...p, code: v }))}
                            placeholder="Ej. 001"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Tipo</label>
                                <select
                                    className={fieldCls}
                                    value={qcProduct.type}
                                    onChange={(e) => setQcProduct(p => ({ ...p, type: e.target.value as ProductType }))}
                                >
                                    <option value="mercancia">Mercancía</option>
                                    <option value="materia_prima">Materia Prima</option>
                                    <option value="producto_terminado">Prod. Terminado</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>IVA</label>
                                <select
                                    className={fieldCls}
                                    value={qcProduct.vatType}
                                    onChange={(e) => setQcProduct(p => ({ ...p, vatType: e.target.value as VatType }))}
                                >
                                    <option value="general">General (16%)</option>
                                    <option value="exento">Exento</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className={labelCls}>Departamento</label>
                                <div className="flex gap-1">
                                    <select
                                        className={fieldCls}
                                        value={qcProduct.departmentId}
                                        onChange={(e) => setQcProduct(p => ({ ...p, departmentId: e.target.value }))}
                                    >
                                        <option value="">Sin departamento</option>
                                        {departments.filter(d => d.active).map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setQcDeptOpen(v => !v)}
                                        className="h-9 px-2 flex-shrink-0 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-[var(--text-tertiary)] hover:text-foreground text-[14px] leading-none transition-colors"
                                        title="Crear departamento"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                        {qcDeptOpen && (
                            <div className="flex gap-2 items-center px-1 py-2 rounded-lg border border-border-light bg-surface-2">
                                <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] whitespace-nowrap pl-1">Nuevo depto.</span>
                                <BaseInput.Field
                                    autoFocus
                                    className="flex-1"
                                    value={qcDeptName}
                                    onValueChange={setQcDeptName}
                                    placeholder="Nombre del departamento"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleQcDepartment(); if (e.key === 'Escape') setQcDeptOpen(false); }}
                                />
                                <button
                                    onClick={handleQcDepartment}
                                    disabled={qcDeptSaving || !qcDeptName.trim()}
                                    className="h-8 px-4 flex-shrink-0 rounded-md bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.12em] transition-colors"
                                >
                                    {qcDeptSaving ? '…' : 'Crear'}
                                </button>
                                <button
                                    onClick={() => setQcDeptOpen(false)}
                                    className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-foreground text-[16px] transition-colors"
                                >
                                    ×
                                </button>
                            </div>
                        )}
                        {error && <p className="text-[13px] text-red-500">{error}</p>}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setQcMode(null)}
                                className="flex-1 h-9 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleQcProduct}
                                disabled={qcSaving}
                                className="flex-1 h-9 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                {qcSaving ? 'Guardando…' : 'Crear producto'}
                            </button>
                        </div>
                    </div>
                </QuickModal>
            )}
        </div>
    );
}
