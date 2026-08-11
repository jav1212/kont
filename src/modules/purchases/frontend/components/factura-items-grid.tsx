"use client";

// Component: FacturaItemsGrid
// Purpose: Editable grid for purchase invoice line items.
// Architectural role: Feature component in the inventory module frontend.
// Constraints: Export name kept as FacturaItemsGrid for backward compatibility with existing pages.

import { useState, useRef, useEffect, useLayoutEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import type {
    PurchaseInvoiceItem,
    VatRate,
    ItemCurrency,
    AdjustmentKind,

} from "@/src/modules/purchases/backend/domain/purchase-invoice";
import type { Product } from "@/src/modules/inventory/backend/domain/product";
import {
    vatRatePct,
    computeLineTotals,
    netFromGross,
    grossFromNet,
    emptyLineAdjustments,
    roundN,
    round4 as round4Shared,
    type AdjustmentCurrency,
} from "@/src/modules/inventory/shared/totals";
import { isLocalCurrency, normalizeCurrencyCode, type CurrencyCode } from "@/src/modules/inventory/shared/currency";
import { CurrencyCombobox } from "@/src/modules/inventory/frontend/components/currency-combobox";
import { notify } from "@/src/shared/frontend/notify";
import { ResponsiveBottomSheet } from "@/src/shared/frontend/components/responsive-bottom-sheet";
import { ResponsiveSelect } from "@/src/shared/frontend/components/responsive-select";

// -- types ---------------------------------------------------------------------

type ColIdx = 0 | 1 | 2; // 0=product, 1=quantity, 2=cost
type NavDir = "tab" | "shift-tab" | "enter" | "down" | "up";

interface Props {
    items: PurchaseInvoiceItem[];
    products: Product[];
    onChange: (items: PurchaseInvoiceItem[]) => void;
    readOnly?: boolean;
    dollarRate?: number | null; // Compatibility fallback for invoices saved before multi-currency rates.
    currencyOptions?: Array<{ code: CurrencyCode; label: string }>;
    getExchangeRate?: (currencyCode: CurrencyCode) => number | null;
    selectedCurrency?: CurrencyCode;
    applyCurrencyToAll?: boolean;
    onApplyCurrencyToAllChange?: (checked: boolean) => void;
    /** Calculation precision: how many decimals all derived totals are rounded to.
     *  Drives both the on-screen formatter and the rounding of `totalCost`. */
    decimals?: number;
    onRequestCreateProduct?: (search: string) => void;
}

// -- helpers -------------------------------------------------------------------

export function emptyItem(currency: CurrencyCode = "VES"): PurchaseInvoiceItem {
    const adj = emptyLineAdjustments();
    return {
        productId: "", quantity: 1, unitCost: 0, totalCost: 0,
        vatRate: "general_16", currency: normalizeCurrencyCode(currency),
        descuentoTipo: adj.descuentoTipo, descuentoValor: adj.descuentoValor, descuentoMonto: 0,
        recargoTipo: adj.recargoTipo, recargoValor: adj.recargoValor, recargoMonto: 0,
        baseIVA: 0,
        ivaIncluido: false,
    };
}

const makeFmt = (decimals: number) => (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const round4 = round4Shared;

// hasAdjustments: si la fila tiene algun ajuste activo, mostramos el badge.
function hasAdjustments(it: PurchaseInvoiceItem): boolean {
    return (
        (it.descuentoTipo != null && (it.descuentoValor ?? 0) > 0) ||
        (it.recargoTipo   != null && (it.recargoValor   ?? 0) > 0)
    );
}

// -- ProductComboCell ----------------------------------------------------------

interface ProductCellProps {
    productId: string;
    products: Product[];
    onSelect: (id: string) => void;
    onNavigate: (dir: NavDir) => void;
    registerRef: (el: HTMLInputElement | null) => void;
    onRequestCreate?: (search: string) => void;
}

function ProductComboCell({ productId, products, onSelect, onNavigate, registerRef, onRequestCreate }: ProductCellProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [hiIdx, setHiIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    // Portal anchor - recomputed from the input's bounding rect so the dropdown
    // can render via createPortal and escape the table wrapper's `overflow-x-auto`,
    // which CSS would otherwise force to clip vertically.
    const [anchor, setAnchor] = useState<{ left: number; top: number; width: number; listHeight: number } | null>(null);
    const hasCreateAction = Boolean(onRequestCreate);

    const selected = products.find((p) => p.id === productId);

    const filtered = products.filter(
        (p) =>
            p.active &&
            (p.name.toLowerCase().includes(search.toLowerCase()) ||
                p.code.toLowerCase().includes(search.toLowerCase()) ||
                (p.barcode?.toLowerCase().includes(search.toLowerCase()) ?? false)),
    ).slice(0, 14);

    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.children[hiIdx] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
    }, [hiIdx]);

    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const el = wrapRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const panelChrome = hasCreateAction ? 45 : 8;
            const preferredListHeight = 224;
            const gap = 5;
            const spaceBelow = window.innerHeight - r.bottom - gap - 8;
            const spaceAbove = r.top - gap - 8;
            const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
            const listHeight = Math.min(preferredListHeight, Math.max(120, (openAbove ? spaceAbove : spaceBelow) - panelChrome));
            const width = Math.min(Math.max(r.width, 380), window.innerWidth - 16);
            setAnchor({
                left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
                top: openAbove ? Math.max(8, r.top - panelChrome - listHeight - gap) : r.bottom + gap,
                width,
                listHeight,
            });
        };
        update();
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [open, hasCreateAction]);

    function openDropdown() { setSearch(""); setHiIdx(0); setOpen(true); }
    function closeDropdown() { setOpen(false); setSearch(""); }
    function selectItem(id: string) { onSelect(id); closeDropdown(); }

    function handleBlur(e: React.FocusEvent) {
        const next = e.relatedTarget as Node | null;
        if (wrapRef.current?.contains(next)) return;
        if (next instanceof Node && document.querySelector('[data-factura-product-combo-portal="true"]')?.contains(next)) return;
        closeDropdown();
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (open) {
            if (e.key === "ArrowDown") { e.preventDefault(); setHiIdx((i) => Math.min(i + 1, filtered.length - 1)); return; }
            if (e.key === "ArrowUp")   { e.preventDefault(); setHiIdx((i) => Math.max(i - 1, 0)); return; }
            if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[hiIdx]) { selectItem(filtered[hiIdx].id!); onNavigate("tab"); }
                return;
            }
            if (e.key === "Escape") { e.preventDefault(); closeDropdown(); return; }
        }
        if (e.key === "Tab") { e.preventDefault(); closeDropdown(); onNavigate(e.shiftKey ? "shift-tab" : "tab"); return; }
        if (e.key === "ArrowDown" && !open) { e.preventDefault(); onNavigate("down"); return; }
        if (e.key === "ArrowUp"   && !open) { e.preventDefault(); onNavigate("up");   return; }
    }

    const displayValue = open
        ? search
        : selected
          ? [selected.code, selected.name].filter(Boolean).join(" - ")
          : "";

    return (
        <div ref={wrapRef} className="relative w-full" onBlur={handleBlur}>
            <input
                ref={registerRef}
                className="w-full h-8 px-2 outline-none bg-transparent font-mono text-[12px] text-foreground focus:bg-primary-500/[0.06] rounded transition-colors"
                value={displayValue}
                placeholder={open ? "Buscar producto..." : "Seleccionar..."}
                onChange={(e) => { setSearch(e.target.value); setHiIdx(0); }}
                onFocus={openDropdown}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
            />
            {open && anchor && typeof document !== "undefined" && createPortal(
                <div
                    data-factura-product-combo-portal="true"
                    style={{
                        position: "fixed",
                        left: anchor.left,
                        top: anchor.top,
                        width: anchor.width,
                        zIndex: 100,
                    }}
                    className="overflow-hidden rounded-lg border border-[var(--control-border)] bg-surface-1 shadow-[0_12px_28px_rgba(0,0,0,.12),0_2px_6px_rgba(0,0,0,.06)]"
                >
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">Sin resultados</div>
                    ) : (
                        <ul ref={listRef} style={{ maxHeight: anchor.listHeight }} className="overflow-y-auto overscroll-contain p-1.5">
                            {filtered.map((p, i) => (
                                <li
                                    key={p.id}
                                    className={[
                                        "cursor-pointer rounded-lg px-3 py-2 flex items-center gap-2 text-[13px]",
                                        i === hiIdx ? "bg-surface-2 text-foreground" : "text-[var(--text-secondary)] hover:bg-surface-2",
                                    ].join(" ")}
                                    onMouseDown={(e) => { e.preventDefault(); selectItem(p.id!); onNavigate("tab"); }}
                                    onMouseEnter={() => setHiIdx(i)}
                                >
                                    {p.code && (
                                        <span className="font-mono text-[11px] text-[var(--text-tertiary)] min-w-[48px]">{p.code}</span>
                                    )}
                                    <span className="truncate">{p.name}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {onRequestCreate && (
                        <button
                            className="w-full px-3 py-2 text-left text-[12px] text-primary-500 hover:bg-primary-500/[0.06] border-t border-border-light/50 transition-colors"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                onRequestCreate(search);
                                closeDropdown();
                            }}
                        >
                            + Crear{search ? ` "${search}"` : ' nuevo producto'}
                        </button>
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
}

// -- NumberCell ----------------------------------------------------------------

interface NumberCellProps {
    value: number;
    onChange: (val: number) => void;
    onNavigate: (dir: NavDir) => void;
    registerRef: (el: HTMLInputElement | null) => void;
    format: (n: number) => string;
    placeholder?: string;
}

function NumberCell({ value, onChange, onNavigate, registerRef, format, placeholder = "0,00" }: NumberCellProps) {
    const [draft, setDraft] = useState<string | null>(null);
    const editing = draft !== null;

    function commit(raw: string) {
        const parsed = parseFloat(raw.replace(",", "."));
        onChange(isNaN(parsed) ? 0 : parsed);
        setDraft(null);
    }

    function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
        const raw = value === 0 ? "" : String(value);
        setDraft(raw);
        requestAnimationFrame(() => e.target.select());
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Tab") { e.preventDefault(); commit(e.currentTarget.value); onNavigate(e.shiftKey ? "shift-tab" : "tab"); return; }
        if (e.key === "Enter") { e.preventDefault(); commit(e.currentTarget.value); onNavigate("enter"); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); commit(e.currentTarget.value); onNavigate("down"); return; }
        if (e.key === "ArrowUp")   { e.preventDefault(); commit(e.currentTarget.value); onNavigate("up");   return; }
    }

    return (
        <input
            ref={registerRef}
            type="text"
            inputMode="decimal"
            className="w-full h-8 px-2 outline-none bg-transparent font-mono text-[12px] text-foreground tabular-nums text-right focus:bg-primary-500/[0.06] rounded transition-colors"
            value={editing ? draft! : value === 0 ? "" : format(value)}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={handleFocus}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={handleKeyDown}
        />
    );
}

// -- AjusteRow -----------------------------------------------------------------
// Mini control: tipo (% o Bs) + numeric value. Reusable for descuento/recargo.

interface AjusteRowProps {
    label:    string;
    tipo:     AdjustmentKind | null;
    valor:    number;
    moneda:   AdjustmentCurrency;
    onMonedaChange: (moneda: AdjustmentCurrency) => void;
    onTipoChange:  (tipo: AdjustmentKind | null) => void;
    onAdjustmentChange?: (tipo: AdjustmentKind | null, moneda: AdjustmentCurrency) => void;
    onValorChange: (valor: number) => void;
    currencyOptions?: Array<{ code: CurrencyCode; label: string }>;
    extraInput?: { value: string; onChange: (v: string) => void; placeholder: string };
    accent?:  "neutral" | "negative" | "positive" | "warning";
}

function AjusteRow({ label, tipo, valor, moneda, onMonedaChange, onTipoChange, onAdjustmentChange, onValorChange, extraInput, accent = "neutral", currencyOptions = [{ code: "VES", label: "Bolívares · VES" }] }: AjusteRowProps) {
    const accentCls =
        accent === "negative" ? "text-error/80"
        : accent === "positive" ? "text-[var(--text-success)]"
        : accent === "warning" ? "text-amber-600"
        : "text-[var(--text-secondary)]";

    return (
        <div className="flex items-center gap-2">
            <span className={`min-w-[88px] font-mono text-[10px] uppercase tracking-[0.12em] ${accentCls}`}>
                {label}
            </span>
            <ResponsiveSelect
                value={!tipo ? "" : tipo === "porcentaje" ? "porcentaje" : "monto"}
                options={[{ value: "", label: "—" }, { value: "porcentaje", label: "%" }, { value: "monto", label: "Monto" }]}
                onChange={(value) => { if (!value) onTipoChange(null); else if (value === "porcentaje") onTipoChange("porcentaje"); else if (onAdjustmentChange) onAdjustmentChange("monto", moneda); else onTipoChange("monto"); }}
                triggerClassName="!h-7 !w-24 !px-2 !font-mono !text-[11px]"
            />
            {tipo === "monto" && <CurrencyCombobox label="" value={normalizeCurrencyCode(moneda)} options={currencyOptions} onChange={(code) => onMonedaChange(code)} triggerClassName="!h-7 !w-28 !px-2 !text-[11px]" />}
            <input
                type="text"
                inputMode="decimal"
                disabled={!tipo}
                value={tipo ? (valor === 0 ? "" : String(valor)) : ""}
                onChange={(e) => {
                    const parsed = parseFloat(e.target.value.replace(",", "."));
                    onValorChange(isNaN(parsed) ? 0 : parsed);
                }}
                placeholder={tipo === "porcentaje" ? "0,00 %" : tipo === "monto" ? `0,00 ${isLocalCurrency(moneda) ? "Bs" : normalizeCurrencyCode(moneda)}` : ""}
                className="w-24 h-7 px-2 rounded border border-border-light bg-surface-1 outline-none font-mono text-[11px] text-foreground tabular-nums text-right disabled:opacity-40 disabled:cursor-not-allowed focus:border-primary-500/60 transition-colors"
            />
            {extraInput && (
                <input
                    type="text"
                    value={extraInput.value}
                    onChange={(e) => extraInput.onChange(e.target.value)}
                    placeholder={extraInput.placeholder}
                    disabled={!tipo}
                    className="flex-1 min-w-[140px] h-7 px-2 rounded border border-border-light bg-surface-1 outline-none font-mono text-[11px] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed focus:border-primary-500/60 transition-colors"
                />
            )}
        </div>
    );
}

// -- FacturaItemsGrid ----------------------------------------------------------

export function FacturaItemsGrid({ items, products, onChange, readOnly = false, dollarRate, currencyOptions = [{ code: "VES", label: "Bolívares" }], getExchangeRate, decimals = 2, onRequestCreateProduct, selectedCurrency, applyCurrencyToAll = true, onApplyCurrencyToAllChange }: Props) {
    const rateFor = (currency: CurrencyCode, fallback?: number | null) => isLocalCurrency(currency) ? 1 : (getExchangeRate?.(currency) ?? fallback ?? dollarRate ?? null);
    const refs = useRef<Map<string, HTMLInputElement>>(new Map());
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [editingMobileIndex, setEditingMobileIndex] = useState<number | null>(null);
    const previousItemCount = useRef(items.length);
    const targetCurrency = normalizeCurrencyCode(selectedCurrency ?? items[0]?.currency ?? "VES");
    const bulkCurrency = targetCurrency;
    const targetRate = rateFor(targetCurrency);

    const fmtN = makeFmt(decimals);
    const round = (n: number) => roundN(n, decimals);
    const placeholder0 = `0,${"0".repeat(Math.max(2, decimals))}`;

    useEffect(() => {
        if (!readOnly && items.length > previousItemCount.current) setEditingMobileIndex(items.length - 1);
        previousItemCount.current = items.length;
    }, [items.length, readOnly]);

    function refKey(row: number, col: ColIdx) { return `${row}-${col}`; }

    function registerRef(row: number, col: ColIdx) {
        return (el: HTMLInputElement | null) => {
            if (el) refs.current.set(refKey(row, col), el);
            else refs.current.delete(refKey(row, col));
        };
    }

    function focusCell(row: number, col: ColIdx) {
        setTimeout(() => { refs.current.get(refKey(row, col))?.focus(); }, 0);
    }

    function toggleExpanded(idx: number) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    }

    // updateItem: handles each field explicitly to avoid unsafe casts.
    // 'currencyCostInput' is a virtual field - converts the selected currency to VES.
    // 'unitCostDisplay' is a virtual field - handles the IVA-incluido toggle: the
    //                   user-entered value is interpreted as gross and converted
    //                   to net before persisting.
    function itemWithCurrency(item: PurchaseInvoiceItem, currency: ItemCurrency): PurchaseInvoiceItem | null {
        const next = { ...item, currency };
        if (!isLocalCurrency(currency)) {
            const rate = rateFor(currency);
            if (!rate) return null;
            next.dollarRate = rate;
            next.exchangeRate = rate;
            next.currencyCost = round4(Number(item.unitCost) / rate);
            next.unitCost = round4(Number(item.unitCost));
        } else {
            next.currencyCost = null; next.dollarRate = null; next.exchangeRate = null;
        }
        next.totalCost = round(Number(next.quantity) * Number(next.unitCost));
        return next;
    }

    function applyCurrencyToAllItems(currency: ItemCurrency) {
        const converted = items.map((item) => itemWithCurrency(item, currency));
        if (converted.some((item) => item == null)) {
            notify.error(`Falta la tasa para convertir a ${normalizeCurrencyCode(currency)}.`);
            return;
        }
        onChange(converted as PurchaseInvoiceItem[]);
    }

    useEffect(() => {
        if (!readOnly && applyCurrencyToAll && selectedCurrency) applyCurrencyToAllItems(targetCurrency);
        // This effect intentionally runs only when the global currency or mode changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetCurrency, targetRate, applyCurrencyToAll, readOnly]);

    function updateItem(
        idx: number,
        field: keyof PurchaseInvoiceItem | 'currencyCostInput' | 'unitCostDisplay',
        val: string | number | boolean | null,
    ) {
        const next = [...items];
        const item: PurchaseInvoiceItem = { ...next[idx] };

        if (field === 'currencyCostInput') {
            const currencyCostVal = Number(val) || 0;
            const rate = rateFor(item.currency, item.exchangeRate ?? item.dollarRate) ?? 1;
            item.currencyCost = currencyCostVal;
            item.dollarRate   = rate;
            item.exchangeRate = rate;
            item.unitCost     = round4(currencyCostVal * rate);
            item.totalCost    = round(item.quantity * item.unitCost);
        } else if (field === 'unitCostDisplay') {
            // User edited the cost cell. If iva_incluido, the typed value is the
            // gross - convert to net for storage. Otherwise it's the net directly.
            const typed = Number(val) || 0;
            item.unitCost = item.ivaIncluido
                ? netFromGross(typed, item.vatRate ?? 'general_16')
                : round4(typed);
            item.totalCost = round(item.quantity * item.unitCost);
            if (isLocalCurrency(item.currency)) item.currencyCost = null;
        } else if (field === "currency") {
            const currency = val as ItemCurrency;
            const converted = itemWithCurrency(item, currency);
            if (!converted) {
                notify.error(`Falta la tasa para convertir a ${normalizeCurrencyCode(currency)}.`);
                return;
            }
            Object.assign(item, converted);
        } else if (field === "ivaIncluido") {
            item.ivaIncluido = !!val;
            // unitCost stays as net; the cell will redisplay using the new mode.
        } else {
            if (field === 'quantity') item.quantity = Number(val) || 0;
            else if (field === 'unitCost') item.unitCost = Number(val) || 0;
            else if (field === 'vatRate') item.vatRate = val as VatRate;
            else if (field === 'productId') item.productId = String(val ?? '');
            else if (field === 'productName') item.productName = val != null ? String(val) : undefined;
            else if (field === 'totalCost') item.totalCost = Number(val) || 0;
            else if (field === 'currencyCost') item.currencyCost = val != null ? Number(val) : null;
            else if (field === 'dollarRate') item.dollarRate = val != null ? Number(val) : null;
            else if (field === 'descuentoTipo') item.descuentoTipo = val as AdjustmentKind | null;
            else if (field === 'descuentoValor') item.descuentoValor = Number(val) || 0;
            else if (field === 'descuentoMoneda') item.descuentoMoneda = val as AdjustmentCurrency;
            else if (field === 'recargoTipo') item.recargoTipo = val as AdjustmentKind | null;
            else if (field === 'recargoValor') item.recargoValor = Number(val) || 0;
            else if (field === 'recargoMoneda') item.recargoMoneda = val as AdjustmentCurrency;

            if (field === 'quantity' || field === 'unitCost') {
                item.totalCost = round(Number(item.quantity) * Number(item.unitCost));
                if (isLocalCurrency(item.currency)) item.currencyCost = null;
            }
            if (field === 'productId') {
                const product = products.find((p) => p.id === val);
                if (product) {
                    if (item.vatRate === 'general_16') {
                        item.vatRate = product.vatType === 'exento' ? 'exenta' : 'general_16';
                    }
                    const productCurrency = item.productId ? item.currency : targetCurrency;
                    const converted = itemWithCurrency(item, productCurrency ?? targetCurrency);
                    if (converted) Object.assign(item, converted);
                }
            }
        }

        if (field === 'descuentoTipo' || field === 'descuentoValor' || field === 'descuentoMoneda' || field === 'recargoTipo' || field === 'recargoValor' || field === 'recargoMoneda') {
            const line = computeLineTotals({
                quantity: Number(item.quantity) || 0,
                unitCost: Number(item.unitCost) || 0,
                vatRate: item.vatRate ?? 'general_16',
                adjustments: {
                    descuentoTipo: item.descuentoTipo ?? null,
                    descuentoValor: item.descuentoValor ?? 0,
                    descuentoMoneda: item.descuentoMoneda ?? 'B',
                    recargoTipo: item.recargoTipo ?? null,
                    recargoValor: item.recargoValor ?? 0,
                    recargoMoneda: item.recargoMoneda ?? 'B',
                },
            }, decimals, rateFor(item.currency, item.exchangeRate ?? item.dollarRate) ?? 0, getExchangeRate);
            item.descuentoMonto = line.descuentoMonto;
            item.recargoMonto = line.recargoMonto;
            item.baseIVA = line.baseIVA;
        }
        next[idx] = item;
        onChange(next);
    }

    function addRow(focusRow?: number) {
        const next = [...items, emptyItem(targetCurrency)];
        onChange(next);
        if (focusRow !== undefined) focusCell(focusRow, 0);
    }

    function removeRow(idx: number) {
        if (items.length === 1) return;
        const next = items.filter((_, i) => i !== idx);
        onChange(next);
        // Drop expansion entry for removed row to avoid stale UI on re-index
        setExpanded((prev) => {
            const out = new Set<number>();
            prev.forEach((i) => {
                if (i < idx) out.add(i);
                else if (i > idx) out.add(i - 1);
            });
            return out;
        });
        focusCell(Math.max(0, idx - 1), 0);
    }

    function handleNavigate(row: number, col: ColIdx, dir: NavDir) {
        const lastRow  = items.length - 1;
        const LAST_COL = 2 as ColIdx;

        if (dir === "tab") {
            if (col < LAST_COL)    { focusCell(row, (col + 1) as ColIdx); }
            else if (row < lastRow) { focusCell(row + 1, 0); }
            else                    { addRow(row + 1); }
        } else if (dir === "shift-tab") {
            if (col > 0)           { focusCell(row, (col - 1) as ColIdx); }
            else if (row > 0)      { focusCell(row - 1, LAST_COL); }
        } else if (dir === "enter") {
            if (row < lastRow)     { focusCell(row + 1, col); }
            else                   { addRow(row + 1); }
        } else if (dir === "down") {
            if (row < lastRow)     { focusCell(row + 1, col); }
        } else if (dir === "up") {
            if (row > 0)           { focusCell(row - 1, col); }
        }
    }

    const foreignItems = items.filter((item) => !isLocalCurrency(item.currency));
    const hasForeignCurrency = foreignItems.length > 0;
    const hasExchangeRates = foreignItems.every((item) => Boolean(rateFor(item.currency, item.exchangeRate ?? item.dollarRate)));
    const foreignCurrencies = Array.from(new Set(foreignItems.map((item) => normalizeCurrencyCode(item.currency))));
    const foreignCurrencyOptions = currencyOptions.filter((option) => !isLocalCurrency(option.code));
    const mobileItem = editingMobileIndex == null ? null : items[editingMobileIndex] ?? null;

    return (
        <div className="overscroll-x-contain md:overflow-x-auto">
            {hasForeignCurrency && (
                <div className="hidden mb-3 flex items-center gap-2 text-[12px]">
                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em]">Tasa BCV</span>
                    {hasExchangeRates ? (<>
                        <span className="hidden font-mono tabular-nums text-amber-600 font-medium">
                            {foreignItems.map((item) => `${normalizeCurrencyCode(item.currency)} ${rateFor(item.currency, item.exchangeRate ?? item.dollarRate)?.toLocaleString("es-VE", { maximumFractionDigits: 6 })}`).join(" · ")} Bs por unidad
                        </span>
                        <span className="font-mono tabular-nums text-amber-600 font-medium">
                            {foreignCurrencies.map((currency) => `${currency} ${rateFor(currency)?.toLocaleString("es-VE", { maximumFractionDigits: 6 })}`).join(" · ")} Bs por unidad
                        </span>
                    </>) : (
                        <span className="text-red-500 font-medium">Falta una tasa para alguna divisa seleccionada</span>
                    )}
                </div>
            )}

            {!readOnly && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-2 text-[11px]">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                        Usar {normalizeCurrencyCode(targetCurrency)} en todas las líneas
                    </span>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={applyCurrencyToAll} onChange={(event) => { const checked = event.target.checked; onApplyCurrencyToAllChange?.(checked); if (checked) applyCurrencyToAllItems(targetCurrency); }} className="h-4 w-4 accent-[var(--primary-500)]" />
                        <button type="button" className="hidden">
                            Bolívares
                        </button>
                        <CurrencyCombobox
                            className="hidden"
                            label=""
                            value={targetCurrency}
                            displayValue={isLocalCurrency(bulkCurrency) ? "Divisa" : `Divisa · ${normalizeCurrencyCode(bulkCurrency)}`}
                            options={foreignCurrencyOptions}
                            onChange={(value) => { if (applyCurrencyToAll) applyCurrencyToAllItems(value as ItemCurrency); }}
                            menuAlign="right"
                            triggerClassName={`!h-8 !rounded-md !border-0 !px-3 !text-[11px] !font-bold !tracking-normal !shadow-none focus-visible:!ring-2 focus-visible:!ring-foreground/15 ${isLocalCurrency(bulkCurrency) ? "!bg-transparent !text-[var(--text-secondary)] hover:!bg-surface-2 hover:!text-foreground" : "!bg-foreground !text-background"}`}
                        />
                    </div>
                </div>
            )}
            <div className="space-y-3 md:hidden">
                {items.map((item, idx) => {
                    const foreign = !isLocalCurrency(item.currency);
                    const productName = item.productName ?? products.find((product) => product.id === item.productId)?.name ?? "Seleccionar producto";
                    const sourceTotal = foreign && rateFor(item.currency, item.exchangeRate ?? item.dollarRate)
                        ? item.totalCost / rateFor(item.currency, item.exchangeRate ?? item.dollarRate)!
                        : null;
                    return (
                        <article key={`mobile-item-${idx}`} className="rounded-xl border border-border-light bg-surface-1 p-3.5 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Línea {idx + 1}</span>
                                    <h3 className={`mt-1 truncate font-sans text-[14px] font-semibold ${item.productId ? "text-foreground" : "text-[var(--text-tertiary)]"}`}>{productName}</h3>
                                </div>
                                {!readOnly && <div className="flex shrink-0 items-center gap-1">
                                    <button type="button" onClick={() => setEditingMobileIndex(idx)} className="h-9 rounded-lg bg-surface-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">Editar</button>
                                    <button type="button" onClick={() => removeRow(idx)} disabled={items.length === 1} aria-label={`Eliminar línea ${idx + 1}`} className="grid size-9 place-items-center rounded-lg text-lg text-error disabled:opacity-30">×</button>
                                </div>}
                            </div>
                            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border-light pt-3">
                                <div><dt className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Cantidad</dt><dd className="mt-1 tabular-nums text-[13px] text-foreground">{fmtN(item.quantity)}</dd></div>
                                <div><dt className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Moneda</dt><dd className="mt-1 font-mono text-[12px] font-bold text-foreground">{normalizeCurrencyCode(item.currency)}</dd></div>
                                <div><dt className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">IVA</dt><dd className="mt-1 text-[12px] text-foreground">{item.vatRate === "exenta" ? "Exenta" : item.vatRate === "reducida_8" ? "8%" : "16%"}{item.ivaIncluido ? " · Inc." : ""}</dd></div>
                            </dl>
                            <div className="mt-3 flex items-end justify-between gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
                                <div><p className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Costo unitario</p><p className="mt-1 tabular-nums text-[12px] text-[var(--text-secondary)]">{foreign ? `${normalizeCurrencyCode(item.currency)} ${fmtN(item.currencyCost ?? 0)}` : `Bs. ${fmtN(item.unitCost)}`}</p></div>
                                <div className="text-right"><p className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Total</p><p className="mt-1 tabular-nums text-[15px] font-bold text-foreground">{sourceTotal != null ? `${normalizeCurrencyCode(item.currency)} ${fmtN(sourceTotal)}` : `Bs. ${fmtN(item.totalCost)}`}</p>{sourceTotal != null && <p className="mt-0.5 tabular-nums text-[10px] text-[var(--text-tertiary)]">≈ Bs. {fmtN(item.totalCost)}</p>}</div>
                            </div>
                        </article>
                    );
                })}
            </div>

            <table className="hidden w-full min-w-[880px] border-collapse text-[13px] md:table">
                <thead>
                    <tr className="border-b border-border-light">
                        <th className="px-2 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal min-w-[220px]">
                            Producto
                        </th>
                        <th className="px-2 py-2 text-right text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal w-24">
                            Cantidad
                        </th>
                        <th className="px-2 py-2 text-center text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal w-20">
                            Moneda
                        </th>
                        <th className="px-2 py-2 text-right text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal w-36">
                            {hasForeignCurrency ? "Costo (en moneda)" : "Costo Unit. Bs"}
                        </th>
                        {hasForeignCurrency && (
                            <th className="px-2 py-2 text-right text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal w-28">
                                Costo Bs
                            </th>
                        )}
                        <th className="px-2 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal w-44">
                            IVA
                        </th>
                        <th className="px-2 py-2 text-right text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal w-32">
                            Total (moneda)
                        </th>
                        {!readOnly && <th className="w-16" />}
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => {
                        const isForeignCurrency = !isLocalCurrency(item.currency);
                        const isExpanded = expanded.has(idx);
                        const hasAdj = hasAdjustments(item);
                        const displayCost = item.ivaIncluido
                            ? grossFromNet(item.unitCost, item.vatRate ?? 'general_16')
                            : item.unitCost;
                        return (
                            <Fragment key={`item-${idx}`}>
                                <tr
                                    className="group border-b border-border-light/60 transition-colors hover:bg-surface-2/30"
                                >
                                    {/* Product */}
                                    <td className="px-1 py-0.5">
                                        {readOnly ? (
                                            <span className="px-2 text-foreground text-[11px]">{item.productName ?? item.productId}</span>
                                        ) : (
                                            <ProductComboCell
                                                productId={item.productId}
                                                products={products}
                                                onSelect={(id) => updateItem(idx, "productId", id)}
                                                onNavigate={(dir) => handleNavigate(idx, 0, dir)}
                                                registerRef={registerRef(idx, 0)}
                                                onRequestCreate={onRequestCreateProduct}
                                            />
                                        )}
                                    </td>

                                    {/* Quantity */}
                                    <td className="px-1 py-0.5">
                                        {readOnly ? (
                                            <span className="px-2 tabular-nums text-right block text-[var(--text-primary)] text-[13px]">{item.quantity}</span>
                                        ) : (
                                            <NumberCell
                                                value={item.quantity}
                                                onChange={(v) => updateItem(idx, "quantity", v)}
                                                onNavigate={(dir) => handleNavigate(idx, 1, dir)}
                                                registerRef={registerRef(idx, 1)}
                                                format={fmtN}
                                                placeholder={placeholder0}
                                            />
                                        )}
                                    </td>

                                    {/* Currency selector */}
                                    <td className="px-1 py-0.5 text-center">
                                        {readOnly ? (
                                            <span className={[
                                                "inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase font-bold tracking-wider",
                                                isForeignCurrency ? "bg-amber-500/10 text-amber-600" : "bg-surface-2 text-[var(--text-tertiary)]",
                                            ].join(" ")}>
                                                {isForeignCurrency ? normalizeCurrencyCode(item.currency) : "Bs"}
                                            </span>
                                        ) : (
                                            <CurrencyCombobox label="" value={normalizeCurrencyCode(item.currency)} options={currencyOptions} onChange={(value) => updateItem(idx, "currency", value as ItemCurrency)} />
                                        )}
                                    </td>

                                    {/* Cost (USD input when currency=D, else Bs net or gross depending on iva_incluido) */}
                                    <td className="px-1 py-0.5">
                                        {readOnly ? (
                                            <span className="px-2 tabular-nums text-right block text-[var(--text-primary)] text-[13px]">
                                                {isForeignCurrency && item.currencyCost != null
                                                    ? `${normalizeCurrencyCode(item.currency)} ${fmtN(item.currencyCost)}`
                                                    : fmtN(displayCost)}
                                            </span>
                                        ) : isForeignCurrency ? (
                                            <NumberCell
                                                value={item.currencyCost ?? 0}
                                                onChange={(v) => updateItem(idx, "currencyCostInput", v)}
                                                onNavigate={(dir) => handleNavigate(idx, 2, dir)}
                                                registerRef={registerRef(idx, 2)}
                                                format={fmtN}
                                                placeholder={placeholder0}
                                            />
                                        ) : (
                                            <NumberCell
                                                value={displayCost}
                                                onChange={(v) => updateItem(idx, "unitCostDisplay", v)}
                                                onNavigate={(dir) => handleNavigate(idx, 2, dir)}
                                                registerRef={registerRef(idx, 2)}
                                                format={fmtN}
                                                placeholder={placeholder0}
                                            />
                                        )}
                                    </td>

                                    {/* Bs cost column (read-only, shown only when any item uses USD) */}
                                    {hasForeignCurrency && (
                                        <td className="px-3 py-0.5 tabular-nums text-right text-[var(--text-secondary)] text-[13px]">
                                            {isForeignCurrency
                                                ? (item.unitCost > 0 ? fmtN(item.unitCost) : "-")
                                                : <span className="text-[var(--text-tertiary)]">-</span>}
                                        </td>
                                    )}

                                    {/* VAT rate selector + IVA-incluido toggle */}
                                    <td className="px-1 py-0.5">
                                        {readOnly ? (
                                            <span className={[
                                                "inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium",
                                                item.vatRate === "exenta"
                                                    ? "bg-surface-2 text-[var(--text-tertiary)]"
                                                    : item.vatRate === "reducida_8"
                                                      ? "bg-amber-500/10 text-amber-600"
                                                      : "bg-primary-500/10 text-primary-500",
                                            ].join(" ")}>
                                                {item.vatRate === "exenta" ? "Exenta" : item.vatRate === "reducida_8" ? "8%" : "16%"}
                                                {item.ivaIncluido && <span className="ml-1 opacity-70">(Inc)</span>}
                                            </span>
                                        ) : (
                                            <div className="flex items-center gap-1">
                                                <ResponsiveSelect<VatRate>
                                                    value={item.vatRate ?? "general_16"}
                                                    options={[{ value: "exenta", label: "Exenta (0%)" }, { value: "reducida_8", label: "Red. (8%)" }, { value: "general_16", label: "Gen. (16%)" }]}
                                                    onChange={(value) => updateItem(idx, "vatRate", value)}
                                                    triggerClassName="!h-8 !border-0 !bg-transparent !px-2 !font-mono !text-[12px]"
                                                />
                                                <button
                                                    tabIndex={-1}
                                                    type="button"
                                                    onClick={() => updateItem(idx, "ivaIncluido", !item.ivaIncluido)}
                                                    className={[
                                                        "h-6 px-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-[0.1em] transition-colors",
                                                        item.ivaIncluido
                                                            ? "bg-primary-500/15 text-primary-500 border border-primary-500/30"
                                                            : "bg-surface-2 text-[var(--text-tertiary)] border border-transparent hover:bg-surface-3 hover:text-[var(--text-secondary)]",
                                                        (item.vatRate ?? 'general_16') === 'exenta' ? "opacity-40 cursor-not-allowed" : "",
                                                    ].join(" ")}
                                                    disabled={(item.vatRate ?? 'general_16') === 'exenta'}
                                                    title={item.ivaIncluido ? "El costo entra con IVA incluido" : "El costo entra sin IVA (se agrega aparte)"}
                                                >
                                                    {item.ivaIncluido ? "Inc" : "Agr"}
                                                </button>
                                            </div>
                                        )}
                                    </td>

                                    {/* Total in row currency */}
                                    <td className="px-3 py-0.5 tabular-nums text-right text-[var(--text-primary)]">                                        {item.totalCost > 0
                                            ? isForeignCurrency
                                                ? (rateFor(item.currency, item.exchangeRate ?? item.dollarRate) ? `${normalizeCurrencyCode(item.currency)} ${fmtN(item.totalCost / rateFor(item.currency, item.exchangeRate ?? item.dollarRate)!)}` : "N/A")
                                                : "Bs. " + fmtN(item.totalCost)
                                            : "N/A"}
                                    </td>

                                    {/* Action buttons (ajustes + remove) */}
                                    {!readOnly && (
                                        <td className="px-1 py-0.5 text-center">
                                            <div className="flex items-center gap-1 justify-end">
                                                <button
                                                    tabIndex={-1}
                                                    type="button"
                                                    onClick={() => toggleExpanded(idx)}
                                                    className={[
                                                        "h-6 w-6 flex items-center justify-center rounded transition-colors text-[12px] font-mono leading-none",
                                                        isExpanded || hasAdj
                                                            ? "bg-primary-500/10 text-primary-500"
                                                            : "text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2",
                                                    ].join(" ")}
                                                    title={hasAdj ? "Editar ajustes" : "Agregar descuento o recargo"}
                                                    aria-label="Ajustes"
                                                >
                                                    {isExpanded ? "-" : hasAdj ? "?" : "+"}
                                                </button>
                                                <button
                                                    tabIndex={-1}
                                                    type="button"
                                                    onClick={() => removeRow(idx)}
                                                    disabled={items.length === 1}
                                                    className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-500 disabled:opacity-0 text-[15px] leading-none transition-all"
                                                    title="Eliminar fila"
                                                >
                                                    -
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                                {isExpanded && !readOnly && (
                                    <tr className="bg-surface-2/30 border-b border-border-light/30">
                                        <td colSpan={hasForeignCurrency ? 8 : 7} className="px-4 py-3">
                                            <div className="space-y-2">
                                                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-1">
                                                    Ajustes de linea - afectan la base IVA
                                                </div>
                                                <AjusteRow
                                                    label="Descuento"
                                                    accent="negative"
                                                    tipo={item.descuentoTipo ?? null}
                                                    valor={item.descuentoValor ?? 0}
                                                    moneda={item.descuentoMoneda ?? "B"}
                                                    onMonedaChange={(moneda) => updateItem(idx, "descuentoMoneda", moneda)}
                                                    onAdjustmentChange={(tipo, moneda) => { const next = [...items]; next[idx] = { ...next[idx], descuentoTipo: tipo, descuentoMoneda: moneda }; onChange(next); }}
                                                    onTipoChange={(v) => updateItem(idx, "descuentoTipo", v)}
                                                    onValorChange={(v) => updateItem(idx, "descuentoValor", v)}
                                                    currencyOptions={currencyOptions}
                                                />
                                                <AjusteRow
                                                    label="Recargo"
                                                    accent="warning"
                                                    tipo={item.recargoTipo ?? null}
                                                    valor={item.recargoValor ?? 0}
                                                    moneda={item.recargoMoneda ?? "B"}
                                                    onMonedaChange={(moneda) => updateItem(idx, "recargoMoneda", moneda)}
                                                    onAdjustmentChange={(tipo, moneda) => { const next = [...items]; next[idx] = { ...next[idx], recargoTipo: tipo, recargoMoneda: moneda }; onChange(next); }}
                                                    onTipoChange={(v) => updateItem(idx, "recargoTipo", v)}
                                                    onValorChange={(v) => updateItem(idx, "recargoValor", v)}
                                                    currencyOptions={currencyOptions}
                                                />
                                                {hasAdj && item.baseIVA != null && item.baseIVA > 0 && (
                                                    <div className="pt-2 border-t border-border-light/40 flex items-center gap-4 font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                                                        <span>
                                                            Base IVA: <span className="text-[var(--text-secondary)] tabular-nums">{fmtN(item.baseIVA)}</span>
                                                        </span>
                                                        {(item.descuentoMonto ?? 0) > 0 && (
                                                            <span>
                                                                - Desc: <span className="text-error/80 tabular-nums">{fmtN(item.descuentoMonto ?? 0)}</span>
                                                            </span>
                                                        )}
                                                        {(item.recargoMonto ?? 0) > 0 && (
                                                            <span>
                                                                + Rec: <span className="text-amber-600 tabular-nums">{fmtN(item.recargoMonto ?? 0)}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>

            {!readOnly && (
                <button
                    tabIndex={-1}
                    onClick={() => addRow(items.length)}
                    className="mt-3 ml-1 text-[12px] text-[var(--text-tertiary)] hover:text-foreground uppercase tracking-[0.12em] transition-colors max-md:flex max-md:h-11 max-md:w-full max-md:items-center max-md:justify-center max-md:rounded-xl max-md:border max-md:border-dashed max-md:border-border-medium max-md:bg-surface-1"
                >
                    + agregar fila{" "}
                    <span className="normal-case opacity-40 ml-1 tracking-normal max-md:hidden">(Tab desde la ultima celda)</span>
                </button>
            )}

            {!readOnly && (
                <p className="mt-3 ml-1 text-[11px] text-[var(--text-tertiary)] opacity-60 tracking-wide max-md:hidden">
                    Tab / Shift+Tab - moverse entre celdas &nbsp;|&nbsp; Enter - bajar en la misma columna &nbsp;|&nbsp; Up/Down - cambiar fila &nbsp;|&nbsp; + - agregar ajustes (descuento, recargo)
                </p>
            )}

            {!readOnly && mobileItem && editingMobileIndex != null && (
                <ResponsiveBottomSheet
                    open
                    onClose={() => setEditingMobileIndex(null)}
                    title={`Editar línea ${editingMobileIndex + 1}`}
                    subtitle="Producto, moneda, costo e IVA"
                    contentClassName="px-4 pb-4"
                    footer={<button type="button" onClick={() => setEditingMobileIndex(null)} className="h-11 w-full rounded-xl bg-primary-500 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-white">Aplicar línea</button>}
                >
                    <div className="space-y-4">
                        <ResponsiveSelect
                            label="Producto"
                            title="Seleccionar producto"
                            subtitle="Busca por nombre o código"
                            searchable
                            value={mobileItem.productId}
                            placeholder="Seleccionar producto…"
                            options={products.filter((product) => product.id).map((product) => ({ value: product.id!, label: product.name, description: product.code }))}
                            onChange={(value) => updateItem(editingMobileIndex, "productId", value)}
                            triggerClassName="!h-12 !rounded-xl !text-[16px]"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block"><span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Cantidad</span><input type="number" inputMode="decimal" min="0" value={mobileItem.quantity || ""} onChange={(event) => updateItem(editingMobileIndex, "quantity", Number(event.target.value))} className="h-12 w-full rounded-xl border border-border-default bg-surface-1 px-3 text-right font-mono text-[16px] text-foreground outline-none" /></label>
                            <CurrencyCombobox label="Moneda" value={normalizeCurrencyCode(mobileItem.currency)} options={currencyOptions} onChange={(value) => updateItem(editingMobileIndex, "currency", value as ItemCurrency)} triggerClassName="!h-12 !rounded-xl !text-[16px]" />
                        </div>
                        <label className="block"><span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Costo unitario · {normalizeCurrencyCode(mobileItem.currency)}</span><input type="number" inputMode="decimal" min="0" value={(isLocalCurrency(mobileItem.currency) ? (mobileItem.ivaIncluido ? grossFromNet(mobileItem.unitCost, mobileItem.vatRate ?? "general_16") : mobileItem.unitCost) : mobileItem.currencyCost) || ""} onChange={(event) => updateItem(editingMobileIndex, isLocalCurrency(mobileItem.currency) ? "unitCostDisplay" : "currencyCostInput", Number(event.target.value))} className="h-12 w-full rounded-xl border border-border-default bg-surface-1 px-3 text-right font-mono text-[16px] text-foreground outline-none" /></label>
                        <div className="grid grid-cols-[1fr_auto] gap-3">
                            <ResponsiveSelect<VatRate> label="IVA" title="Seleccionar IVA" value={mobileItem.vatRate ?? "general_16"} options={[{ value: "exenta", label: "Exenta (0%)" }, { value: "reducida_8", label: "Reducida (8%)" }, { value: "general_16", label: "General (16%)" }]} onChange={(value) => updateItem(editingMobileIndex, "vatRate", value)} triggerClassName="!h-12 !rounded-xl !text-[16px]" />
                            <label className="flex min-w-24 flex-col"><span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Incluido</span><button type="button" disabled={(mobileItem.vatRate ?? "general_16") === "exenta"} onClick={() => updateItem(editingMobileIndex, "ivaIncluido", !mobileItem.ivaIncluido)} className={`h-12 rounded-xl border px-3 font-mono text-[11px] font-bold uppercase ${mobileItem.ivaIncluido ? "border-primary-500/40 bg-primary-500/10 text-primary-500" : "border-border-default bg-surface-1 text-[var(--text-secondary)]"}`}>{mobileItem.ivaIncluido ? "Sí" : "No"}</button></label>
                        </div>
                        <div className="rounded-xl bg-surface-2 px-3 py-3 text-right"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Total de la línea</p><p className="mt-1 tabular-nums text-[18px] font-bold text-foreground">Bs. {fmtN(mobileItem.totalCost)}</p></div>
                    </div>
                </ResponsiveBottomSheet>
            )}
        </div>
    );
}

// Re-export shared math-related utilities for convenience to consuming pages.
export { vatRatePct };


