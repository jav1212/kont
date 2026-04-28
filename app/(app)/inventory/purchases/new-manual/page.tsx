"use client";

// Page: NuevaEntradaManualPage
// Purpose: Create a manual inventory entry (without a purchase invoice).
// Architectural role: Page-level composition using inventory hook and English domain types.
// All identifiers use English; JSX user-facing text remains in Spanish.

import { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect, startTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Plus, X, CheckCircle2, ArrowRight, Save, FileText, Boxes, Calculator, Info } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { notify } from "@/src/shared/frontend/notify";
import { BcvRateInput, parseRateStr, roundRateValue, useBcvRate } from "@/src/modules/inventory/frontend/components/bcv-rate-input";
import type { Movement } from "@/src/modules/inventory/backend/domain/movement";
import type { Product } from "@/src/modules/inventory/backend/domain/product";
import {
    computeLineTotals,
    emptyLineAdjustments,
    type LineAdjustments,
    type VatRate as VatRateStr,
} from "@/src/modules/inventory/shared/totals";
import { LineAdjustmentsPanel } from "@/src/modules/inventory/frontend/components/line-adjustments-panel";

// ── helpers ───────────────────────────────────────────────────────────────────

const todayStr = () => getTodayIsoDate();
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtN = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Subtle uppercase chip used as in-card group label. Reads as chrome — never
// content. Sits above each subgroup of fields inside the "Datos" card.
const groupLabelCls = "font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-semibold";

// Konta canon: clickable inputs use border-default. Used by the Notas textarea.
const fieldCls = [
    "w-full px-3 rounded-lg border border-border-default bg-surface-1 outline-none",
    "font-mono text-[14px] text-foreground",
    "focus:border-primary-500 hover:border-border-medium transition-colors duration-150",
].join(" ");

type IvaMode = "agregado" | "incluido";

// ── ManualItem ────────────────────────────────────────────────────────────────

interface ManualItem {
    productId: string;
    productName: string;
    quantity: number;
    currency: "B" | "D";
    currencyCost: number; // price entered in the chosen currency (base or incl. VAT depending on ivaMode)
    vatRate: number;      // 0 or 0.16, derived from product
    adjustments: LineAdjustments;
}

function emptyManualItem(): ManualItem {
    return {
        productId: "", productName: "", quantity: 1, currency: "B", currencyCost: 0, vatRate: 0,
        adjustments: emptyLineAdjustments(),
    };
}

function vatRateToString(rate: number): VatRateStr {
    if (rate >= 0.15) return "general_16";
    if (rate > 0)     return "reducida_8";
    return "exenta";
}

function hasAdjustments(adj: LineAdjustments): boolean {
    return (
        (adj.descuentoTipo != null && adj.descuentoValor > 0) ||
        (adj.recargoTipo   != null && adj.recargoValor   > 0)
    );
}

function computeCosts(item: ManualItem, dollarRate: number | null, ivaMode: IvaMode) {
    const enteredPriceBs = item.currency === "D"
        ? (dollarRate ? round2(item.currencyCost * dollarRate) : 0)
        : item.currencyCost;

    // 1. Convert gross→net if "incluido"
    const baseUnitBs = (item.vatRate > 0 && ivaMode === "incluido")
        ? round2(enteredPriceBs / (1 + item.vatRate))
        : enteredPriceBs;

    // 2. Apply line adjustments via shared math
    const t = computeLineTotals({
        quantity:    item.quantity,
        unitCost:    baseUnitBs,
        vatRate:     vatRateToString(item.vatRate),
        adjustments: item.adjustments,
    });

    // 3. Stored cost on the movement reflects the adjusted unit cost
    const adjustedUnitCost = item.quantity > 0 ? round2(t.baseIVA / item.quantity) : baseUnitBs;
    const adjustedTotalCost = t.baseIVA;

    const baseCurrencyCost = item.currency === "D"
        ? (ivaMode === "incluido" && item.vatRate > 0
            ? round2(item.currencyCost / (1 + item.vatRate))
            : item.currencyCost)
        : null;

    return {
        unitCost: adjustedUnitCost,
        totalCost: adjustedTotalCost,
        baseCostBs: baseUnitBs,            // raw base for display preview
        vatTotalAmount: t.ivaMonto,
        totalWithVat: t.total,
        baseCurrencyCost,
        descuentoMonto: t.descuentoMonto,
        recargoMonto:   t.recargoMonto,
        baseIVA:        t.baseIVA,
    };
}

// ── ProductCombo ──────────────────────────────────────────────────────────────

function ProductCombo({
    value,
    products,
    onChange,
}: {
    value: string;
    products: Product[];
    onChange: (id: string, name: string, vatRate: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [hiIdx, setHiIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputWrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    // Portal anchor — recomputed from the input's bounding rect so the dropdown
    // can render via createPortal and escape any ancestor `overflow-hidden`/
    // `overflow-x-auto` (which CSS would otherwise force to clip vertically).
    const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

    const selected = products.find((p) => p.id === value);
    const filtered = products.filter(
        (p) => p.active !== false && p.name.toLowerCase().includes(search.toLowerCase()),
    );

    useEffect(() => {
        const el = listRef.current?.children[hiIdx] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
    }, [hiIdx]);

    // Position the portal under the input. Re-anchor on scroll/resize so the
    // dropdown follows the input if the table or page scrolls while open.
    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const el = inputWrapRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            setAnchor({ left: r.left, top: r.bottom + 2, width: r.width });
        };
        update();
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [open]);

    function select(p: Product) {
        onChange(p.id!, p.name, p.vatType === "general" ? 0.16 : 0);
        setOpen(false);
        setSearch("");
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (!open) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setHiIdx((i) => Math.min(i + 1, filtered.length - 1)); }
        if (e.key === "ArrowUp")   { e.preventDefault(); setHiIdx((i) => Math.max(i - 1, 0)); }
        if (e.key === "Enter")     { e.preventDefault(); if (filtered[hiIdx]) select(filtered[hiIdx]); }
        if (e.key === "Escape")    { e.preventDefault(); setOpen(false); setSearch(""); }
    }

    function handleBlur(e: React.FocusEvent) {
        // Allow focus to land on the portalized dropdown without closing it.
        const next = e.relatedTarget as Node | null;
        if (wrapRef.current?.contains(next)) return;
        if (next instanceof Node && document.querySelector('[data-product-combo-portal="true"]')?.contains(next)) return;
        setOpen(false);
        setSearch("");
    }

    const displayValue = open ? search : (selected?.name ?? "");

    return (
        <div ref={wrapRef} className="relative w-full" onBlur={handleBlur}>
            <div ref={inputWrapRef} className="flex items-center gap-1.5">
                <BaseInput.Field
                    className="flex-1"
                    value={displayValue}
                    placeholder={open ? "Buscar producto…" : "Seleccionar producto…"}
                    onValueChange={(v) => { setSearch(v); setHiIdx(0); }}
                    onFocus={() => { setSearch(""); setHiIdx(0); setOpen(true); }}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    spellCheck="false"
                />
                {selected && (
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        selected.vatType === "general"
                            ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                            : "bg-surface-2 text-[var(--text-tertiary)] border border-border-light"
                    }`}>
                        {selected.vatType === "general" ? "16%" : "EX"}
                    </span>
                )}
            </div>
            {open && anchor && typeof document !== "undefined" && createPortal(
                <div
                    data-product-combo-portal="true"
                    style={{
                        position: "fixed",
                        left: anchor.left,
                        top: anchor.top,
                        width: anchor.width,
                        zIndex: 100,
                    }}
                    className="rounded-lg border border-border-medium bg-surface-1 shadow-xl overflow-hidden"
                >
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">Sin resultados</div>
                    ) : (
                        <ul ref={listRef} className="max-h-52 overflow-y-auto">
                            {filtered.map((p, i) => (
                                <li
                                    key={p.id}
                                    className={[
                                        "px-3 py-2 cursor-pointer text-[13px] flex items-center gap-2",
                                        i === hiIdx ? "bg-primary-500/10 text-foreground" : "text-[var(--text-secondary)] hover:bg-surface-2",
                                    ].join(" ")}
                                    onMouseDown={(e) => { e.preventDefault(); select(p); }}
                                    onMouseEnter={() => setHiIdx(i)}
                                >
                                    {p.code && <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{p.code}</span>}
                                    <span className="flex-1">{p.name}</span>
                                    <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                                        p.vatType === "general"
                                            ? "text-amber-600"
                                            : "text-[var(--text-tertiary)]"
                                    }`}>
                                        {p.vatType === "general" ? "IVA 16%" : "Exento"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function NuevaEntradaManualPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const { products, loadProducts, saveMovement } = useInventory();

    const [date, setDate] = useState(todayStr());
    const [notes, setNotes] = useState("");
    const [ivaMode, setIvaMode] = useState<IvaMode>("agregado");
    const {
        rate: dollarRateStr,
        decimals: rateDecimals,
        setRateFromApi,
        setRateTyped,
        applyDecimals,
    } = useBcvRate();
    const [rateDateBcv, setRateDateBcv] = useState<string | null>(null);
    const [rateLoading, setRateLoading] = useState(false);
    const [rateError, setRateError] = useState<string | null>(null);

    const dollarRate = useMemo<number | null>(() => {
        const r = parseRateStr(dollarRateStr);
        return isFinite(r) ? roundRateValue(r, rateDecimals) : null;
    }, [dollarRateStr, rateDecimals]);
    const [items, setItems] = useState<ManualItem[]>([emptyManualItem()]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [expandedAdj, setExpandedAdj] = useState<Set<number>>(new Set());

    function toggleAdjExpanded(idx: number) {
        setExpandedAdj((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    }

    useEffect(() => {
        if (companyId) loadProducts(companyId);
    }, [companyId, loadProducts]);

    useEffect(() => {
        if (!date) return;
        let cancelled = false;
        startTransition(() => {
            setRateLoading(true);
            setRateError(null);
            setRateDateBcv(null);
        });
        fetch(`/api/bcv/rate?date=${date}&code=USD`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                if (json.rate) {
                    setRateFromApi(json.rate, rateDecimals);
                    setRateDateBcv(json.date);
                    setRateError(null);
                } else {
                    setRateError(json.error ?? "Sin datos BCV para esta fecha");
                }
            })
            .catch(() => { if (!cancelled) setRateError("Error al consultar BCV"); })
            .finally(() => { if (!cancelled) setRateLoading(false); });
        return () => { cancelled = true; };
    }, [date]);

    const updateItem = useCallback((index: number, patch: Partial<ManualItem>) => {
        setItems((prev) => prev.map((item, i) => i !== index ? item : { ...item, ...patch }));
    }, []);

    function addRow() { setItems((prev) => [...prev, emptyManualItem()]); }
    function removeRow(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)); }

    function validate(): boolean {
        if (!companyId) { notify.error("Sin empresa seleccionada"); return false; }
        if (items.length === 0) { notify.error("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productId) { notify.error("Selecciona un producto en cada fila"); return false; }
            if (item.quantity <= 0) { notify.error("La cantidad debe ser mayor a 0"); return false; }
            if (item.currencyCost < 0) { notify.error("El costo no puede ser negativo"); return false; }
            if (item.currency === "D" && !dollarRate) {
                notify.error("No hay tasa BCV disponible para esta fecha. Cambia la fecha o usa Bs.");
                return false;
            }
        }
        return true;
    }

    async function handleSave() {
        if (!validate()) return;
        setSaving(true);
        let allOk = true;
        for (const item of items) {
            const c = computeCosts(item, dollarRate, ivaMode);
            const movement: Movement = {
                companyId: companyId!,
                productId: item.productId,
                type: "entrada",
                date,
                period: date.slice(0, 7),
                quantity: item.quantity,
                unitCost: c.unitCost,
                totalCost: c.totalCost,
                balanceQuantity: 0,
                reference: "Entrada manual",
                notes,
                currency: item.currency,
                currencyCost: c.baseCurrencyCost,
                dollarRate: item.currency === "D" ? dollarRate : null,
                descuentoTipo:  item.adjustments.descuentoTipo,
                descuentoValor: item.adjustments.descuentoValor,
                descuentoMonto: c.descuentoMonto,
                recargoTipo:    item.adjustments.recargoTipo,
                recargoValor:   item.adjustments.recargoValor,
                recargoMonto:   c.recargoMonto,
                baseIVA:        c.baseIVA,
            };
            const result = await saveMovement(movement);
            if (!result) { allOk = false; break; }
        }
        setSaving(false);
        if (allOk) setSaved(true);
    }

    const totals = items.reduce(
        (acc, item) => {
            const { totalCost, vatTotalAmount, totalWithVat } = computeCosts(item, dollarRate, ivaMode);
            return { subtotal: acc.subtotal + totalCost, vat: acc.vat + vatTotalAmount, total: acc.total + totalWithVat };
        },
        { subtotal: 0, vat: 0, total: 0 },
    );
    const hasVat = items.some((i) => i.vatRate > 0);
    const priceLabel = ivaMode === "agregado" ? "Precio base" : "Precio c/IVA";

    if (saved) {
        const period = date.slice(0, 7);
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                    <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">Entrada Manual</h1>
                </div>
                <div className="px-8 py-10 flex flex-col items-center">
                    <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] px-8 py-8 text-center max-w-md w-full">
                        <div className="flex items-center justify-center gap-2 text-green-500 mb-2">
                            <CheckCircle2 size={16} strokeWidth={2} />
                            <span className="text-[13px] font-bold uppercase tracking-[0.14em]">Entrada registrada</span>
                        </div>
                        <p className="text-[var(--text-secondary)] text-[13px] mb-6 font-sans">
                            Las existencias han sido actualizadas exitosamente.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                rightIcon={<ArrowRight size={14} strokeWidth={2} />}
                                onClick={() => router.push("/inventory/purchases")}
                            >
                                Ver entradas
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
            <PageHeader title="Entrada Manual de Inventario" subtitle="Registro directo de aumento de existencias">
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

                <div className="space-y-4">
                    {/* Row 1 — Datos de la entrada + Resumen */}
                    <div className="flex gap-6 items-start">
                        {/* Datos de la entrada */}
                        <section className="flex-1 min-w-0 rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">

                            {/* ── Card header ────────────────────────────────────── */}
                            <header className="px-6 pt-5 pb-4 border-b border-border-light flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500 flex-shrink-0">
                                    <FileText size={14} strokeWidth={2} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground leading-none">
                                        Datos de la entrada
                                    </h2>
                                    <p className="mt-1.5 text-[12px] font-sans text-[var(--text-tertiary)] leading-snug">
                                        Registro directo al inventario sin proveedor ni Nº de factura.
                                    </p>
                                </div>
                            </header>

                            {/* ── Group 1 · Fecha y tasa ─────────────────────────── */}
                            <div className="px-6 pt-5 pb-5">
                                <div className="mb-3 flex items-center gap-2">
                                    <span className={groupLabelCls}>Fecha y tasa</span>
                                    <span className="flex-1 h-px bg-border-light" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <BaseInput.Field
                                        label="Fecha"
                                        isRequired
                                        type="date"
                                        value={date}
                                        onValueChange={setDate}
                                    />
                                    <BcvRateInput
                                        rate={dollarRateStr}
                                        onRateChange={(v) => { setRateTyped(v); setRateDateBcv(null); }}
                                        decimals={rateDecimals}
                                        onDecimalsChange={applyDecimals}
                                        loading={rateLoading}
                                        bcvDate={rateDateBcv}
                                        error={rateError}
                                    />
                                </div>

                                <div className="mt-3 flex items-start gap-1.5">
                                    <Info size={12} strokeWidth={2} className="mt-[2px] flex-shrink-0 text-[var(--text-tertiary)]" />
                                    <p className="text-[11px] font-sans text-[var(--text-tertiary)] leading-snug">
                                        La <span className="font-mono uppercase tracking-[0.10em] text-[10px]">fecha</span> determina la tasa BCV consultada y el mes contable donde entran las existencias.
                                    </p>
                                </div>
                            </div>

                            {/* ── Group 2 · Tratamiento de IVA ───────────────────── */}
                            <div className="px-6 pt-5 pb-5 border-t border-border-light">
                                <div className="mb-3 flex items-center gap-2">
                                    <span className={groupLabelCls}>Tratamiento de IVA</span>
                                    <span className="flex-1 h-px bg-border-light" />
                                </div>

                                <div className="flex flex-wrap gap-3 items-center">
                                    <div
                                        role="radiogroup"
                                        aria-label="Tratamiento de IVA"
                                        className="inline-flex rounded-lg border border-border-default bg-surface-1 overflow-hidden h-10 text-[12px]"
                                    >
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={ivaMode === "agregado"}
                                            className={[
                                                "px-4 transition-colors uppercase tracking-[0.10em]",
                                                ivaMode === "agregado"
                                                    ? "bg-primary-500 text-white"
                                                    : "text-[var(--text-secondary)] hover:bg-surface-2",
                                            ].join(" ")}
                                            onClick={() => setIvaMode("agregado")}
                                        >
                                            IVA Agregado
                                        </button>
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={ivaMode === "incluido"}
                                            className={[
                                                "px-4 border-l border-border-default transition-colors uppercase tracking-[0.10em]",
                                                ivaMode === "incluido"
                                                    ? "bg-primary-500 text-white"
                                                    : "text-[var(--text-secondary)] hover:bg-surface-2",
                                            ].join(" ")}
                                            onClick={() => setIvaMode("incluido")}
                                        >
                                            IVA Incluido
                                        </button>
                                    </div>
                                    <span className="font-sans text-[12px] text-[var(--text-tertiary)] flex-1 leading-snug min-w-[200px]">
                                        {ivaMode === "agregado"
                                            ? "El precio ingresado es la base — el IVA se calcula y suma encima."
                                            : "El precio ingresado ya incluye IVA — se extrae la base para el inventario."}
                                    </span>
                                </div>
                            </div>

                            {/* ── Group 3 · Notas ────────────────────────────────── */}
                            <div className="px-6 pt-5 pb-5 border-t border-border-light">
                                <div className="mb-3 flex items-center gap-2">
                                    <span className={groupLabelCls}>Notas</span>
                                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]/70">opcional</span>
                                    <span className="flex-1 h-px bg-border-light" />
                                </div>
                                <textarea
                                    className={`${fieldCls} py-2.5 resize-none leading-snug placeholder:text-neutral-400 dark:placeholder:text-neutral-600`}
                                    rows={3}
                                    maxLength={300}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Motivo de la entrada, referencia interna, ajuste contable, donación recibida…"
                                />
                                <div className="mt-1.5 flex items-center justify-end">
                                    <span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]/70">
                                        {notes.length} / 300
                                    </span>
                                </div>
                            </div>
                        </section>

                        {/* Resumen — same row as Datos */}
                        <div className="w-72 flex-shrink-0">
                            <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                                <div className="px-5 py-4 border-b border-border-light flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500">
                                        <Calculator size={14} strokeWidth={2} />
                                    </div>
                                    <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                                        Resumen
                                    </h3>
                                </div>

                                <div className="px-5 py-4 space-y-3 text-[13px]">
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Fecha</span>
                                        <span className="text-foreground tabular-nums">{date || "—"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Tratamiento</span>
                                        <span className="text-foreground uppercase tracking-[0.10em] text-[11px]">
                                            {ivaMode === "agregado" ? "Agregado" : "Incluido"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Productos</span>
                                        <span className="text-foreground tabular-nums">{items.filter((i) => i.productId).length}</span>
                                    </div>
                                </div>

                                <div className="px-5 py-4 border-t border-border-light bg-surface-2/40 space-y-2 text-[13px]">
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Base</span>
                                        <span className="tabular-nums text-[var(--text-primary)]">{fmtN(totals.subtotal)}</span>
                                    </div>
                                    {hasVat && (
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA</span>
                                            <span className="tabular-nums text-amber-600">{fmtN(totals.vat)}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="px-5 py-4 border-t border-border-light">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-foreground uppercase tracking-[0.12em] text-[11px] font-semibold">Total</span>
                                        <span className="tabular-nums font-bold text-foreground text-[20px]">
                                            Bs. {fmtN(hasVat ? totals.total : totals.subtotal)}
                                        </span>
                                    </div>
                                    {dollarRate && totals.subtotal > 0 && (
                                        <div className="flex items-baseline justify-between mt-1">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[10px]">≈ USD</span>
                                            <span className="tabular-nums text-[var(--text-tertiary)] text-[12px]">
                                                ${fmtN((hasVat ? totals.total : totals.subtotal) / dollarRate)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Row 2 — Productos (full width) */}
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                            <div className="px-5 py-4 border-b border-border-light flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500">
                                        <Boxes size={14} strokeWidth={2} />
                                    </div>
                                    <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
                                        Productos
                                    </h2>
                                </div>
                                <button
                                    onClick={addRow}
                                    className="h-8 px-3 rounded-lg border border-border-default bg-surface-1 hover:bg-surface-2 hover:border-border-medium text-[var(--text-tertiary)] hover:text-foreground transition-colors flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] shadow-sm"
                                    type="button"
                                >
                                    <Plus size={12} strokeWidth={2} />
                                    Agregar fila
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                {/* Column headers */}
                                <div className="grid grid-cols-[minmax(220px,1fr)_100px_140px_100px_36px_36px] gap-2 px-4 py-2 border-b border-border-light bg-surface-2/50 min-w-[720px]">
                                    {["Producto", "Cantidad", priceLabel, "Moneda", "", ""].map((h, i) => (
                                        <span key={i} className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{h}</span>
                                    ))}
                                </div>

                                {/* Rows */}
                                <div className="divide-y divide-border-light/50 min-w-[720px]">
                                    {items.map((item, idx) => {
                                        const adjOpen = expandedAdj.has(idx);
                                        const hasAdj = hasAdjustments(item.adjustments);
                                        return (
                                            <div key={idx}>
                                                <div className="grid grid-cols-[minmax(220px,1fr)_100px_140px_100px_36px_36px] gap-2 px-4 py-2 items-center hover:bg-surface-2/40 transition-colors">
                                                    <ProductCombo
                                                        value={item.productId}
                                                        products={products}
                                                        onChange={(id, name, vatRate) => updateItem(idx, { productId: id, productName: name, vatRate })}
                                                    />
                                                    <BaseInput.Field
                                                        type="number"
                                                        className="w-full"
                                                        inputClassName="text-right"
                                                        value={item.quantity ? String(item.quantity) : ""}
                                                        onValueChange={(v) => updateItem(idx, { quantity: Number(v) || 0 })}
                                                        placeholder="0"
                                                        min={0}
                                                        step={1}
                                                    />
                                                    <BaseInput.Field
                                                        type="number"
                                                        className="w-full"
                                                        inputClassName="text-right"
                                                        value={item.currencyCost ? String(item.currencyCost) : ""}
                                                        onValueChange={(v) => updateItem(idx, { currencyCost: Number(v) || 0 })}
                                                        placeholder="0.00"
                                                        min={0}
                                                        step={0.01}
                                                        suffix={item.currency === "D" ? "USD" : "Bs"}
                                                    />
                                                    <div className="inline-flex rounded-lg border border-border-default overflow-hidden h-10 text-[12px] shadow-sm">
                                                        <button
                                                            type="button"
                                                            className={[
                                                                "flex-1 px-1 transition-colors uppercase tracking-[0.10em]",
                                                                item.currency === "B" ? "bg-primary-500 text-white" : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                                                            ].join(" ")}
                                                            onClick={() => updateItem(idx, { currency: "B" })}
                                                        >
                                                            Bs
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={[
                                                                "flex-1 px-1 border-l border-border-default transition-colors uppercase tracking-[0.10em]",
                                                                item.currency === "D" ? "bg-primary-500 text-white" : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2",
                                                            ].join(" ")}
                                                            onClick={() => updateItem(idx, { currency: "D" })}
                                                        >
                                                            USD
                                                        </button>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleAdjExpanded(idx)}
                                                        className={[
                                                            "w-9 h-10 flex items-center justify-center rounded transition-colors text-[14px] font-mono leading-none",
                                                            adjOpen || hasAdj
                                                                ? "bg-primary-500/10 text-primary-500"
                                                                : "text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2",
                                                        ].join(" ")}
                                                        aria-label="Ajustes de línea"
                                                        title={hasAdj ? "Editar ajustes" : "Agregar descuento o recargo"}
                                                    >
                                                        {adjOpen ? "−" : hasAdj ? "●" : "+"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeRow(idx)}
                                                        disabled={items.length === 1}
                                                        className="w-9 h-10 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:text-[var(--text-tertiary)] disabled:hover:bg-transparent transition-colors"
                                                        aria-label="Eliminar fila"
                                                    >
                                                        <X size={14} strokeWidth={2} />
                                                    </button>
                                                </div>
                                                {adjOpen && (
                                                    <div className="px-4 py-3 bg-surface-2/30 border-t border-border-light/40">
                                                        <LineAdjustmentsPanel
                                                            value={item.adjustments}
                                                            onChange={(next) => updateItem(idx, { adjustments: next })}
                                                            title="Ajustes de línea — afectan la base IVA"
                                                            showResolved={(() => {
                                                                const c = computeCosts(item, dollarRate, ivaMode);
                                                                return {
                                                                    descuentoMonto: c.descuentoMonto,
                                                                    recargoMonto:   c.recargoMonto,
                                                                    baseIVA:        c.baseIVA,
                                                                };
                                                            })()}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-4 py-3 border-t border-border-light bg-surface-2/40 flex items-center justify-between">
                                <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] tabular-nums">
                                    {items.length} {items.length === 1 ? "fila" : "filas"}
                                </span>
                                {items.some((i) => i.currency === "D") && dollarRate && (
                                    <span className="font-sans text-[12px] text-[var(--text-tertiary)] tabular-nums">
                                        Conversión USD → Bs.: <span className="font-mono text-foreground">{fmtN(dollarRate)}</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Info note */}
                        <div className="px-4 py-3 rounded-lg border border-border-light bg-surface-1 font-sans text-[13px] text-[var(--text-tertiary)] leading-relaxed flex items-start gap-2">
                            <Info size={14} strokeWidth={2} className="text-[var(--text-tertiary)] flex-shrink-0 mt-0.5" />
                            <span>
                                Esta entrada se registra directamente en el inventario sin asociarse a una factura de proveedor.
                                Si tienes una factura, usa <strong className="font-mono uppercase tracking-[0.06em] text-foreground">Nueva factura</strong> para incluir datos de IVA y proveedor.
                            </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-3 pb-2">
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={() => router.back()}
                                disabled={saving}
                            >
                                Cancelar
                            </BaseButton.Root>
                        <BaseButton.Root
                            variant="primary"
                            size="md"
                            leftIcon={<Save size={14} strokeWidth={2} />}
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? "Registrando…" : "Registrar entrada"}
                        </BaseButton.Root>
                    </div>
                </div>
            </div>
        </div>
    );
}
