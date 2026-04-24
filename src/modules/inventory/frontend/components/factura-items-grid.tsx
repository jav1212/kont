"use client";

// Component: FacturaItemsGrid
// Purpose: Editable grid for purchase invoice line items.
// Architectural role: Feature component in the inventory module frontend.
// Constraints: Export name kept as FacturaItemsGrid for backward compatibility with existing pages.

import { useState, useRef, useEffect } from "react";
import type { PurchaseInvoiceItem, VatRate, ItemCurrency } from "@/src/modules/inventory/backend/domain/purchase-invoice";
import type { Product } from "@/src/modules/inventory/backend/domain/product";

// ── types ─────────────────────────────────────────────────────────────────────

type ColIdx = 0 | 1 | 2; // 0=product, 1=quantity, 2=cost
type NavDir = "tab" | "shift-tab" | "enter" | "down" | "up";

const VAT_RATE_LABELS: Record<VatRate, string> = {
    exenta:      'Exenta (0%)',
    reducida_8:  'Red. (8%)',
    general_16:  'Gen. (16%)',
};
void VAT_RATE_LABELS;

interface Props {
    items: PurchaseInvoiceItem[];
    products: Product[];
    onChange: (items: PurchaseInvoiceItem[]) => void;
    readOnly?: boolean;
    dollarRate?: number | null; // BCV rate for the period — used for USD→Bs conversion
    onRequestCreateProduct?: (search: string) => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

export function emptyItem(): PurchaseInvoiceItem {
    return { productId: "", quantity: 1, unitCost: 0, totalCost: 0, vatRate: "general_16", currency: "B" };
}

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── ProductComboCell ──────────────────────────────────────────────────────────

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

    const selected = products.find((p) => p.id === productId);

    const filtered = products.filter(
        (p) =>
            p.active &&
            (p.name.toLowerCase().includes(search.toLowerCase()) ||
                p.code.toLowerCase().includes(search.toLowerCase())),
    );

    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.children[hiIdx] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
    }, [hiIdx]);

    function openDropdown() { setSearch(""); setHiIdx(0); setOpen(true); }
    function closeDropdown() { setOpen(false); setSearch(""); }
    function selectItem(id: string) { onSelect(id); closeDropdown(); }

    function handleBlur(e: React.FocusEvent) {
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) closeDropdown();
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
          ? [selected.code, selected.name].filter(Boolean).join(" · ")
          : "";

    return (
        <div ref={wrapRef} className="relative w-full" onBlur={handleBlur}>
            <input
                ref={registerRef}
                className="w-full h-8 px-2 outline-none bg-transparent font-mono text-[12px] text-foreground focus:bg-primary-500/[0.06] rounded transition-colors"
                value={displayValue}
                placeholder={open ? "Buscar producto…" : "Seleccionar…"}
                onChange={(e) => { setSearch(e.target.value); setHiIdx(0); }}
                onFocus={openDropdown}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
            />
            {open && (
                <div className="absolute left-0 top-full z-50 min-w-[300px] mt-0.5 rounded-lg border border-border-medium bg-surface-1 shadow-xl overflow-hidden">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">Sin resultados</div>
                    ) : (
                        <ul ref={listRef} className="max-h-52 overflow-y-auto">
                            {filtered.map((p, i) => (
                                <li
                                    key={p.id}
                                    className={[
                                        "px-3 py-2 cursor-pointer flex items-center gap-2 text-[13px]",
                                        i === hiIdx ? "bg-primary-500/10 text-foreground" : "text-[var(--text-secondary)] hover:bg-surface-2",
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
                </div>
            )}
        </div>
    );
}

// ── NumberCell ────────────────────────────────────────────────────────────────

interface NumberCellProps {
    value: number;
    onChange: (val: number) => void;
    onNavigate: (dir: NavDir) => void;
    registerRef: (el: HTMLInputElement | null) => void;
}

function NumberCell({ value, onChange, onNavigate, registerRef }: NumberCellProps) {
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
            value={editing ? draft! : value === 0 ? "" : fmtN(value)}
            placeholder="0,00"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={handleFocus}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={handleKeyDown}
        />
    );
}

// ── FacturaItemsGrid ──────────────────────────────────────────────────────────

export function FacturaItemsGrid({ items, products, onChange, readOnly = false, dollarRate, onRequestCreateProduct }: Props) {
    const refs = useRef<Map<string, HTMLInputElement>>(new Map());

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

    // updateItem: handles each field explicitly to avoid unsafe casts.
    // 'currencyCostInput' is a virtual field — triggers USD cost recomputation.
    function updateItem(idx: number, field: keyof PurchaseInvoiceItem | 'currencyCostInput', val: string | number | boolean | null) {
        const next = [...items];
        const item: PurchaseInvoiceItem = { ...next[idx] };

        if (field === 'currencyCostInput') {
            // User edited the USD cost — recompute unitCost (Bs)
            const currencyCostVal = Number(val) || 0;
            const rate = dollarRate ?? item.dollarRate ?? 1;
            item.currencyCost = currencyCostVal;
            item.dollarRate   = rate;
            item.unitCost     = round4(currencyCostVal * rate);
            item.totalCost    = round2(item.quantity * item.unitCost);
        } else if (field === 'currency') {
            item.currency = val as ItemCurrency;
            if (val === 'D') {
                // Switch to USD: derive currencyCost from existing unitCost if not set
                const rate = dollarRate ?? 1;
                item.dollarRate = rate;
                if (!item.currencyCost) {
                    // Back-compute currencyCost from unitCost
                    item.currencyCost = rate > 0 ? round4(item.unitCost / rate) : 0;
                }
                item.unitCost  = round4((item.currencyCost ?? 0) * rate);
                item.totalCost = round2(item.quantity * item.unitCost);
            } else {
                item.currencyCost = null;
                item.dollarRate   = null;
                // unitCost stays as-is (already in Bs)
                item.totalCost = round2(item.quantity * item.unitCost);
            }
        } else {
            if (field === 'quantity') item.quantity = Number(val) || 0;
            else if (field === 'unitCost') item.unitCost = Number(val) || 0;
            else if (field === 'vatRate') item.vatRate = val as VatRate;
            else if (field === 'productId') item.productId = String(val ?? '');
            else if (field === 'productName') item.productName = val != null ? String(val) : undefined;
            else if (field === 'totalCost') item.totalCost = Number(val) || 0;
            else if (field === 'currencyCost') item.currencyCost = val != null ? Number(val) : null;
            else if (field === 'dollarRate') item.dollarRate = val != null ? Number(val) : null;

            if (field === 'quantity' || field === 'unitCost') {
                item.totalCost = round2(Number(item.quantity) * Number(item.unitCost));
                // Clear currencyCost when Bs cost changes directly (currency='B')
                if (item.currency !== 'D') item.currencyCost = null;
            }
            if (field === 'productId') {
                const product = products.find((p) => p.id === val);
                if (product) {
                    // Auto-fill VAT rate from product
                    if (item.vatRate === 'general_16') {
                        item.vatRate = product.vatType === 'exento' ? 'exenta' : 'general_16';
                    }
                    item.currency     = 'B';
                    item.currencyCost = null;
                    item.dollarRate   = null;
                }
            }
        }

        next[idx] = item;
        onChange(next);
    }

    function addRow(focusRow?: number) {
        const next = [...items, emptyItem()];
        onChange(next);
        if (focusRow !== undefined) focusCell(focusRow, 0);
    }

    function removeRow(idx: number) {
        if (items.length === 1) return;
        const next = items.filter((_, i) => i !== idx);
        onChange(next);
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

    const hasDollarRate = !!dollarRate;
    const anyUsd = items.some((i) => i.currency === 'D');

    return (
        <div className="overflow-x-auto">
            {/* Dollar rate hint shown when any item uses USD */}
            {anyUsd && (
                <div className="mb-3 flex items-center gap-2 text-[12px]">
                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em]">Tasa BCV</span>
                    {hasDollarRate ? (
                        <span className="font-mono tabular-nums text-amber-600 font-medium">
                            {dollarRate!.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} Bs/USD
                        </span>
                    ) : (
                        <span className="text-red-500 font-medium">No definida — configura la tasa en Cierres</span>
                    )}
                </div>
            )}

            <table className="w-full text-[13px] border-collapse">
                <thead>
                    <tr className="border-b border-border-light">
                        <th className="px-2 py-2 text-left text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal">
                            Producto
                        </th>
                        <th className="px-2 py-2 text-right text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal w-24">
                            Cantidad
                        </th>
                        <th className="px-2 py-2 text-center text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal w-16">
                            Moneda
                        </th>
                        <th className="px-2 py-2 text-right text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal w-32">
                            {anyUsd ? "Costo (en moneda)" : "Costo Unit. Bs"}
                        </th>
                        {anyUsd && (
                            <th className="px-2 py-2 text-right text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal w-28">
                                Costo Bs
                            </th>
                        )}
                        <th className="px-2 py-2 text-left text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal w-28">
                            IVA
                        </th>
                        <th className="px-2 py-2 text-right text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-normal w-32">
                            Total Bs
                        </th>
                        {!readOnly && <th className="w-8" />}
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => {
                        const isUsd = item.currency === 'D';
                        return (
                            <tr
                                key={idx}
                                className="border-b border-border-light/30 hover:bg-surface-2/40 group"
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
                                        />
                                    )}
                                </td>

                                {/* Currency selector */}
                                <td className="px-1 py-0.5 text-center">
                                    {readOnly ? (
                                        <span className={[
                                            "inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase font-bold tracking-wider",
                                            isUsd ? "bg-amber-500/10 text-amber-600" : "bg-surface-2 text-[var(--text-tertiary)]",
                                        ].join(" ")}>
                                            {isUsd ? "USD" : "Bs"}
                                        </span>
                                    ) : (
                                        <select
                                            tabIndex={-1}
                                            value={item.currency ?? "B"}
                                            onChange={(e) => updateItem(idx, "currency", e.target.value as ItemCurrency)}
                                            className={[
                                                "w-full h-8 px-1 outline-none bg-transparent text-[12px] font-mono font-bold",
                                                "focus:bg-primary-500/[0.06] rounded transition-colors cursor-pointer",
                                                isUsd ? "text-amber-600" : "text-[var(--text-tertiary)]",
                                            ].join(" ")}
                                        >
                                            <option value="B">Bs</option>
                                            <option value="D">USD</option>
                                        </select>
                                    )}
                                </td>

                                {/* Cost (USD input when currency=D, Bs otherwise) */}
                                <td className="px-1 py-0.5">
                                    {readOnly ? (
                                        <span className="px-2 tabular-nums text-right block text-[var(--text-primary)] text-[13px]">
                                            {isUsd && item.currencyCost != null
                                                ? `$${fmtN(item.currencyCost)}`
                                                : fmtN(item.unitCost)}
                                        </span>
                                    ) : isUsd ? (
                                        <NumberCell
                                            value={item.currencyCost ?? 0}
                                            onChange={(v) => updateItem(idx, "currencyCostInput", v)}
                                            onNavigate={(dir) => handleNavigate(idx, 2, dir)}
                                            registerRef={registerRef(idx, 2)}
                                        />
                                    ) : (
                                        <NumberCell
                                            value={item.unitCost}
                                            onChange={(v) => updateItem(idx, "unitCost", v)}
                                            onNavigate={(dir) => handleNavigate(idx, 2, dir)}
                                            registerRef={registerRef(idx, 2)}
                                        />
                                    )}
                                </td>

                                {/* Bs cost column (read-only, shown only when any item uses USD) */}
                                {anyUsd && (
                                    <td className="px-3 py-0.5 tabular-nums text-right text-[var(--text-secondary)] text-[13px]">
                                        {isUsd
                                            ? (item.unitCost > 0 ? fmtN(item.unitCost) : "—")
                                            : <span className="text-[var(--text-tertiary)]">—</span>}
                                    </td>
                                )}

                                {/* VAT rate selector */}
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
                                        </span>
                                    ) : (
                                        <select
                                            tabIndex={-1}
                                            value={item.vatRate ?? "general_16"}
                                            onChange={(e) => updateItem(idx, "vatRate", e.target.value as VatRate)}
                                            className="w-full h-8 px-1.5 outline-none bg-transparent text-[12px] text-foreground font-mono focus:bg-primary-500/[0.06] rounded transition-colors cursor-pointer"
                                        >
                                            <option value="exenta">Exenta (0%)</option>
                                            <option value="reducida_8">Reducida (8%)</option>
                                            <option value="general_16">General (16%)</option>
                                        </select>
                                    )}
                                </td>

                                {/* Total Bs (always read-only) */}
                                <td className="px-3 py-0.5 tabular-nums text-right text-[var(--text-primary)]">
                                    {item.totalCost > 0 ? fmtN(item.totalCost) : "—"}
                                </td>

                                {/* Remove row button */}
                                {!readOnly && (
                                    <td className="px-1 py-0.5 text-center">
                                        <button
                                            tabIndex={-1}
                                            onClick={() => removeRow(idx)}
                                            disabled={items.length === 1}
                                            className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-500 disabled:opacity-0 text-[15px] leading-none transition-all"
                                            title="Eliminar fila"
                                        >
                                            ×
                                        </button>
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {!readOnly && (
                <button
                    tabIndex={-1}
                    onClick={() => addRow(items.length)}
                    className="mt-2 ml-1 text-[12px] text-[var(--text-tertiary)] hover:text-foreground uppercase tracking-[0.12em] transition-colors"
                >
                    + agregar fila{" "}
                    <span className="normal-case opacity-40 ml-1 tracking-normal">(Tab desde la última celda)</span>
                </button>
            )}

            {!readOnly && (
                <p className="mt-3 ml-1 text-[11px] text-[var(--text-tertiary)] opacity-60 tracking-wide">
                    Tab · Shift+Tab — moverse entre celdas &nbsp;|&nbsp; Enter — bajar en la misma columna &nbsp;|&nbsp; ↑↓ — cambiar fila
                </p>
            )}
        </div>
    );
}
