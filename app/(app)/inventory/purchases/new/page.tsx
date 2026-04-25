"use client";

// Page: NuevaFacturaPage
// Purpose: Create a new purchase invoice (factura de compra) with line items.
// Architectural role: Page-level composition using inventory hook and shared domain types.
// All identifiers use English domain types; JSX user-facing text remains in Spanish.

import { useEffect, useState, useCallback, useRef } from "react";
import { ChevronLeft, Plus, X, CheckCircle2, ArrowRight, Save, FileText, Boxes, Calculator } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { PurchaseInvoice, PurchaseInvoiceItem } from "@/src/modules/inventory/backend/domain/purchase-invoice";
import { FacturaItemsGrid, emptyItem } from "@/src/modules/inventory/frontend/components/factura-items-grid";
import { BcvRateInput, parseRateStr, roundRateValue, useBcvRate } from "@/src/modules/inventory/frontend/components/bcv-rate-input";
import type { ProductType, VatType } from "@/src/modules/inventory/backend/domain/product";

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
                        className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X size={14} strokeWidth={2} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ── StatusChip ────────────────────────────────────────────────────────────────
// Small uppercase pill used in the page header + resumen header. Tone maps to
// the semantic badge tokens so it reads consistently across light/dark modes.

type ChipTone = "neutral" | "success" | "warning" | "info";

function StatusChip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
    const toneCls =
        tone === "success" ? "badge-success"
        : tone === "warning" ? "badge-warning"
        : tone === "info"    ? "badge-info"
        : "bg-surface-2 text-[var(--text-tertiary)] border-border-light";
    return (
        <span className={[
            "inline-flex items-center gap-1 px-2 h-6 rounded-md border",
            "font-mono text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap",
            toneCls,
        ].join(" ")}>
            {children}
        </span>
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

    const filtered = suppliers.filter(
        (s) =>
            s.active !== false &&
            (s.name.toLowerCase().includes(search.toLowerCase()) ||
                (s.rif ?? "").toLowerCase().includes(search.toLowerCase())),
    );

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
    const {
        rate: dollarRate,
        decimals: rateDecimals,
        setRateFromApi,
        setRateTyped,
        applyDecimals,
    } = useBcvRate();
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
            setRateFromApi(currentDollarRate, rateDecimals);
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
                    setRateFromApi(json.rate, rateDecimals);
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
    // Auto-fetch on date change only; `rateDecimals` shouldn't retrigger a fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const effectiveDollarRate = (() => {
        const r = parseRateStr(dollarRate);
        return isFinite(r) ? roundRateValue(r, rateDecimals) : null;
    })();

    const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? null;
    const itemCount = items.filter((i) => i.productId).length;

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
        dollarRate:    effectiveDollarRate,
        rateDecimals,
    }), [companyId, supplierId, invoiceNumber, controlNumber, date, subtotal, vatAmount, total, notes, effectiveDollarRate, rateDecimals]);

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
                <PageHeader title="Nueva Factura de Compra" subtitle="Registro completado">
                    <StatusChip tone="success">
                        <CheckCircle2 size={10} strokeWidth={2.5} />
                        Confirmada
                    </StatusChip>
                </PageHeader>

                <div className="px-8 py-10 flex justify-center">
                    <div className="w-full max-w-xl rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                        {/* Success banner */}
                        <div className="px-6 py-5 border-b border-border-light bg-[var(--badge-success-bg)]/40 flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-[var(--badge-success-bg)] border border-[var(--badge-success-border)] flex items-center justify-center text-[var(--text-success)] flex-shrink-0">
                                <CheckCircle2 size={20} strokeWidth={2} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-[14px] font-bold uppercase tracking-[0.14em] text-foreground">
                                    Factura confirmada
                                </h2>
                                <p className="text-[12px] text-[var(--text-secondary)] font-sans leading-snug mt-0.5">
                                    Entradas registradas en el período {period}. Las existencias y el kardex ya reflejan el movimiento.
                                </p>
                            </div>
                        </div>

                        {/* Meta */}
                        <dl className="px-6 py-4 space-y-2.5 text-[13px]">
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Nº Factura</dt>
                                <dd className="text-foreground font-medium tabular-nums">{invoiceNumber || "—"}</dd>
                            </div>
                            {controlNumber && (
                                <div className="flex justify-between gap-3">
                                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Nº Control</dt>
                                    <dd className="text-foreground font-medium tabular-nums">{controlNumber}</dd>
                                </div>
                            )}
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Proveedor</dt>
                                <dd className="text-foreground font-medium truncate max-w-[60%] text-right">
                                    {supplierName ?? "—"}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Fecha</dt>
                                <dd className="text-foreground tabular-nums">{date || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Ítems</dt>
                                <dd className="text-foreground tabular-nums">{itemCount}</dd>
                            </div>
                            {effectiveDollarRate && (
                                <div className="flex justify-between gap-3">
                                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Tasa BCV</dt>
                                    <dd className="text-foreground tabular-nums">
                                        {effectiveDollarRate.toLocaleString("es-VE", { minimumFractionDigits: rateDecimals, maximumFractionDigits: rateDecimals })} Bs/USD
                                    </dd>
                                </div>
                            )}
                        </dl>

                        {/* Total */}
                        <div className="px-6 py-4 border-t border-border-light bg-surface-2/40">
                            <div className="flex items-baseline justify-between">
                                <span className="text-foreground uppercase tracking-[0.14em] text-[11px] font-bold">Total</span>
                                <span className="tabular-nums font-bold text-foreground text-[24px] tracking-tight">
                                    Bs. {fmtN(total)}
                                </span>
                            </div>
                            {effectiveDollarRate && total > 0 && (
                                <div className="flex items-baseline justify-between mt-0.5">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">≈ USD</span>
                                    <span className="tabular-nums text-[var(--text-tertiary)] text-[13px] font-semibold">
                                        ${fmtN(total / effectiveDollarRate)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="px-6 py-4 border-t border-border-light flex items-center gap-3 flex-wrap">
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={() => router.push(`/inventory/movements?periodo=${period}`)}
                            >
                                Ver movimientos
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                rightIcon={<ArrowRight size={14} strokeWidth={2} />}
                                onClick={() => router.push("/inventory/purchases")}
                                className="ml-auto"
                            >
                                Ver facturas
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
                <StatusChip tone={savedId ? "warning" : "neutral"}>
                    {savedId ? "Borrador · Guardado" : "Borrador · Nuevo"}
                </StatusChip>
                <BaseButton.Root
                    variant="secondary"
                    size="md"
                    leftIcon={<ChevronLeft size={14} strokeWidth={2} />}
                    onClick={() => router.back()}
                >
                    Volver
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6">
                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg border badge-error flex items-start gap-2">
                        <X size={14} strokeWidth={2.2} className="mt-[2px] flex-shrink-0" />
                        <span className="font-sans text-[13px] leading-snug">{error}</span>
                    </div>
                )}

                <div className="space-y-4">
                    {/* Row 1 — Datos de la factura + Resumen */}
                    <div className="flex gap-6 items-start">
                        {/* Datos de la factura */}
                        <section className="flex-1 min-w-0 rounded-xl border border-border-light bg-surface-1 p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-5">
                                <div className="w-7 h-7 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500">
                                    <FileText size={13} strokeWidth={2} />
                                </div>
                                <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                    Datos de la factura
                                </h2>
                            </div>

                            {/* Row 1 — Proveedor (span 2) + Nº Factura */}
                            <div className="grid grid-cols-3 gap-4 mb-4">
                                <div className="col-span-2">
                                    <label className={labelCls}>
                                        Proveedor <span className="text-error/80">*</span>
                                    </label>
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
                                            className="h-10 w-10 shrink-0 rounded-lg border border-border-default bg-surface-1 hover:bg-surface-2 hover:border-border-medium text-[var(--text-tertiary)] hover:text-foreground transition-colors flex items-center justify-center shadow-sm"
                                            title="Crear nuevo proveedor"
                                            aria-label="Crear nuevo proveedor"
                                        >
                                            <Plus size={14} strokeWidth={2} />
                                        </button>
                                    </div>
                                </div>
                                <BaseInput.Field
                                    label="Nº Factura"
                                    value={invoiceNumber}
                                    onValueChange={setInvoiceNumber}
                                    placeholder="0001-00123456"
                                />
                            </div>

                            {/* Row 2 — Nº Control · Fecha · Tasa BCV */}
                            <div className="grid grid-cols-3 gap-4 mb-4">
                                <BaseInput.Field
                                    label="Nº Control"
                                    value={controlNumber}
                                    onValueChange={setControlNumber}
                                    placeholder="00-00123456"
                                />
                                <BaseInput.Field
                                    label="Fecha"
                                    type="date"
                                    value={date}
                                    onValueChange={setDate}
                                />
                                <BcvRateInput
                                    rate={dollarRate}
                                    onRateChange={(v) => { setRateTyped(v); setRateDateBcv(null); }}
                                    decimals={rateDecimals}
                                    onDecimalsChange={applyDecimals}
                                    loading={rateLoading}
                                    bcvDate={rateDateBcv}
                                    error={rateError}
                                />
                            </div>

                            {/* Row 3 — Notas */}
                            <div>
                                <label className={labelCls}>Notas</label>
                                <textarea
                                    className={`${fieldCls} h-auto py-2 resize-none`}
                                    rows={2}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Observaciones opcionales sobre la factura…"
                                />
                            </div>
                        </section>

                        {/* Resumen — same row as Datos */}
                        <aside className="w-80 flex-shrink-0">
                            <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                                {/* Header */}
                                <div className="px-5 py-3 border-b border-border-light bg-surface-2/50 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <Calculator size={13} strokeWidth={2} className="text-primary-500" />
                                        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">
                                            Resumen
                                        </h3>
                                    </div>
                                    <StatusChip tone={savedId ? "warning" : "neutral"}>
                                        {savedId ? "Guardado" : "Nuevo"}
                                    </StatusChip>
                                </div>

                                {/* Meta */}
                                <dl className="px-5 py-3.5 space-y-2 text-[12px]">
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Proveedor</dt>
                                        <dd className="text-foreground font-medium truncate text-right max-w-[60%]">
                                            {supplierName ?? "—"}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Nº Factura</dt>
                                        <dd className="text-foreground tabular-nums truncate text-right max-w-[60%]">
                                            {invoiceNumber || "—"}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Fecha</dt>
                                        <dd className="text-foreground tabular-nums">{date || "—"}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Tasa BCV</dt>
                                        <dd className="text-foreground tabular-nums">
                                            {effectiveDollarRate
                                                ? effectiveDollarRate.toLocaleString("es-VE", { minimumFractionDigits: rateDecimals, maximumFractionDigits: rateDecimals })
                                                : "—"}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Ítems</dt>
                                        <dd className="text-foreground tabular-nums">{itemCount}</dd>
                                    </div>
                                </dl>

                                {/* Bases breakdown — only when there's taxed content */}
                                {(baseExempt > 0 || baseTaxed8 > 0 || baseTaxed16 > 0) && (
                                    <dl className="px-5 py-3 border-t border-border-light bg-surface-2/40 space-y-1.5 text-[12px]">
                                        {baseExempt > 0 && (
                                            <div className="flex justify-between">
                                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Base exenta</dt>
                                                <dd className="tabular-nums text-[var(--text-secondary)]">{fmtN(baseExempt)}</dd>
                                            </div>
                                        )}
                                        {baseTaxed8 > 0 && (
                                            <>
                                                <div className="flex justify-between">
                                                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Base 8%</dt>
                                                    <dd className="tabular-nums text-[var(--text-secondary)]">{fmtN(baseTaxed8)}</dd>
                                                </div>
                                                <div className="flex justify-between">
                                                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">IVA 8%</dt>
                                                    <dd className="tabular-nums text-[var(--text-warning)] font-medium">{fmtN(vat8)}</dd>
                                                </div>
                                            </>
                                        )}
                                        {baseTaxed16 > 0 && (
                                            <>
                                                <div className="flex justify-between">
                                                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Base 16%</dt>
                                                    <dd className="tabular-nums text-[var(--text-secondary)]">{fmtN(baseTaxed16)}</dd>
                                                </div>
                                                <div className="flex justify-between">
                                                    <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">IVA 16%</dt>
                                                    <dd className="tabular-nums text-[var(--text-secondary)]">{fmtN(vat16)}</dd>
                                                </div>
                                            </>
                                        )}
                                    </dl>
                                )}

                                {/* Subtotal + IVA rollup */}
                                <dl className="px-5 py-3 border-t border-border-light space-y-1.5 text-[12px]">
                                    <div className="flex justify-between">
                                        <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Subtotal</dt>
                                        <dd className="tabular-nums text-[var(--text-secondary)]">{fmtN(subtotal)}</dd>
                                    </div>
                                    {vatAmount > 0 && (
                                        <div className="flex justify-between">
                                            <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">Total IVA</dt>
                                            <dd className="tabular-nums text-[var(--text-secondary)]">{fmtN(vatAmount)}</dd>
                                        </div>
                                    )}
                                </dl>

                                {/* Total hero */}
                                <div className="px-5 py-4 border-t border-border-default bg-surface-1">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-foreground uppercase tracking-[0.14em] text-[10px] font-bold">Total</span>
                                        <span className="tabular-nums font-bold text-foreground text-[22px] tracking-tight">
                                            Bs. {fmtN(total)}
                                        </span>
                                    </div>
                                    {effectiveDollarRate && total > 0 ? (
                                        <div className="flex items-baseline justify-between mt-0.5">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">≈ USD</span>
                                            <span className="tabular-nums text-[var(--text-tertiary)] text-[13px] font-semibold">
                                                ${fmtN(total / effectiveDollarRate)}
                                            </span>
                                        </div>
                                    ) : !effectiveDollarRate && total > 0 ? (
                                        <p className="mt-1 text-[10px] font-sans text-[var(--text-tertiary)] leading-snug">
                                            Define la tasa BCV para ver el equivalente en USD.
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        </aside>
                    </div>

                    {/* Row 2 — Productos (full width) */}
                    <section className="rounded-xl border border-border-light bg-surface-1 p-6 shadow-sm">
                        <div className="mb-5 flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500">
                                    <Boxes size={13} strokeWidth={2} />
                                </div>
                                <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                    Productos
                                </h2>
                                <span
                                    className="ml-2 inline-flex items-center justify-center h-6 px-2 rounded-md border border-border-light bg-surface-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)] tabular-nums"
                                    title="Ítems con producto seleccionado"
                                >
                                    {itemCount} {itemCount === 1 ? "ítem" : "ítems"}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setQcMode('product'); setError(null); }}
                                className="h-8 px-3 text-[11px] uppercase tracking-[0.12em] rounded-lg border border-border-default bg-surface-1 hover:bg-surface-2 hover:border-border-medium text-[var(--text-tertiary)] hover:text-foreground transition-colors flex items-center gap-1.5 shadow-sm"
                            >
                                <Plus size={12} strokeWidth={2} />
                                Nuevo producto
                            </button>
                        </div>

                        <FacturaItemsGrid
                            items={items}
                            products={products}
                            onChange={setItems}
                            dollarRate={effectiveDollarRate}
                            onRequestCreateProduct={(search) => {
                                setQcProduct(p => ({ ...p, name: search }));
                                setQcMode('product');
                                setError(null);
                            }}
                        />

                        {/* Inline totals — full breakdown lives in the resumen above */}
                        <div className="mt-5 pt-4 border-t border-border-light flex items-baseline justify-end gap-6 flex-wrap">
                            <div className="flex items-baseline gap-2">
                                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                    Subtotal
                                </span>
                                <span className="font-mono tabular-nums text-[var(--text-secondary)] text-[13px]">
                                    {fmtN(subtotal)}
                                </span>
                            </div>
                            {vatAmount > 0 && (
                                <div className="flex items-baseline gap-2">
                                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                        IVA
                                    </span>
                                    <span className="font-mono tabular-nums text-[var(--text-secondary)] text-[13px]">
                                        {fmtN(vatAmount)}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-baseline gap-2 pl-5 border-l border-border-light">
                                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground font-bold">
                                    Total
                                </span>
                                <span className="font-mono tabular-nums font-bold text-foreground text-[18px]">
                                    Bs. {fmtN(total)}
                                </span>
                                {effectiveDollarRate && total > 0 && (
                                    <span className="font-mono tabular-nums text-[var(--text-tertiary)] text-[12px]">
                                        · ${fmtN(total / effectiveDollarRate)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Row 3 — Actions footer */}
                    <div className="flex items-center gap-3 rounded-xl border border-border-light bg-surface-1 px-4 py-3 shadow-sm flex-wrap">
                        <BaseButton.Root
                            variant="secondary"
                            size="md"
                            leftIcon={<Save size={14} strokeWidth={2} />}
                            onClick={handleSaveDraft}
                            loading={saving}
                            disabled={confirming}
                        >
                            {saving ? "Guardando…" : "Guardar borrador"}
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="primary"
                            size="md"
                            leftIcon={<CheckCircle2 size={14} strokeWidth={2} />}
                            onClick={handleConfirm}
                            loading={confirming}
                            disabled={saving}
                        >
                            {confirming ? "Confirmando…" : "Confirmar factura"}
                        </BaseButton.Root>
                        {savedId && !confirmed && (
                            <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-success)]">
                                <CheckCircle2 size={12} strokeWidth={2} />
                                Borrador guardado
                            </span>
                        )}
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
                                        className="h-9 w-9 flex-shrink-0 rounded-lg border border-border-default bg-surface-1 hover:bg-surface-2 hover:border-border-medium text-[var(--text-tertiary)] hover:text-foreground transition-colors flex items-center justify-center shadow-sm"
                                        title="Crear departamento"
                                        aria-label="Crear departamento"
                                    >
                                        <Plus size={12} strokeWidth={2} />
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
                                    className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                                    aria-label="Cancelar"
                                >
                                    <X size={12} strokeWidth={2} />
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
