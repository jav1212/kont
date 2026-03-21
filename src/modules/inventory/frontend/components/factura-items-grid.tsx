"use client";

import { useState, useRef, useEffect } from "react";
import type { FacturaCompraItem, IvaAlicuota, MonedaItem } from "@/src/modules/inventory/backend/domain/factura-compra";
import type { Producto } from "@/src/modules/inventory/backend/domain/producto";

// ── types ─────────────────────────────────────────────────────────────────────

type ColIdx = 0 | 1 | 2; // 0=producto, 1=cantidad, 2=costo
type NavDir = "tab" | "shift-tab" | "enter" | "down" | "up";

const ALICUOTA_LABELS: Record<IvaAlicuota, string> = {
    exenta:      'Exenta (0%)',
    reducida_8:  'Red. (8%)',
    general_16:  'Gen. (16%)',
};
void ALICUOTA_LABELS; // suppress unused warning

interface Props {
    items: FacturaCompraItem[];
    productos: Producto[];
    onChange: (items: FacturaCompraItem[]) => void;
    readOnly?: boolean;
    tasaDolar?: number | null; // tasa BCV del período — para conversión USD→Bs
    onRequestCreateProducto?: (search: string) => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

export function emptyItem(): FacturaCompraItem {
    return { productoId: "", cantidad: 1, costoUnitario: 0, costoTotal: 0, ivaAlicuota: "general_16", moneda: "B" };
}

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── ProductComboCell ──────────────────────────────────────────────────────────

interface ProductCellProps {
    productoId: string;
    productos: Producto[];
    onSelect: (id: string) => void;
    onNavigate: (dir: NavDir) => void;
    registerRef: (el: HTMLInputElement | null) => void;
    onRequestCreate?: (search: string) => void;
}

function ProductComboCell({ productoId, productos, onSelect, onNavigate, registerRef, onRequestCreate }: ProductCellProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [hiIdx, setHiIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selected = productos.find((p) => p.id === productoId);

    const filtered = productos
        .filter(
            (p) =>
                p.activo &&
                (p.nombre.toLowerCase().includes(search.toLowerCase()) ||
                    p.codigo.toLowerCase().includes(search.toLowerCase())),
        )
        .slice(0, 12);

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
          ? [selected.codigo, selected.nombre].filter(Boolean).join(" · ")
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
                                    {p.codigo && (
                                        <span className="font-mono text-[11px] text-[var(--text-tertiary)] min-w-[48px]">{p.codigo}</span>
                                    )}
                                    <span className="truncate">{p.nombre}</span>
                                    {p.monedaDefecto === "D" && (
                                        <span className="ml-auto text-[11px] font-bold text-amber-500 uppercase tracking-wider">USD</span>
                                    )}
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

export function FacturaItemsGrid({ items, productos, onChange, readOnly = false, tasaDolar, onRequestCreateProducto }: Props) {
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

    function updateItem(idx: number, field: keyof FacturaCompraItem | 'costoMonedaInput', val: unknown) {
        const next = [...items];
        let item = { ...next[idx] } as FacturaCompraItem & { costoMoneda?: number | null; tasaDolar?: number | null };

        if (field === 'costoMonedaInput') {
            // User edited the USD cost — recompute costoUnitario (Bs)
            const costoUsd = Number(val) || 0;
            const tasa = tasaDolar ?? item.tasaDolar ?? 1;
            item.costoMoneda = costoUsd;
            item.tasaDolar   = tasa;
            item.costoUnitario = round4(costoUsd * tasa);
            item.costoTotal  = round2(item.cantidad * item.costoUnitario);
        } else if (field === 'moneda') {
            item.moneda = val as MonedaItem;
            if (val === 'D') {
                // Switch to USD: use existing costoUnitario as costoMoneda if no costoMoneda yet
                const tasa = tasaDolar ?? 1;
                item.tasaDolar = tasa;
                if (!item.costoMoneda) {
                    // Try to back-compute costoMoneda from costoUnitario
                    item.costoMoneda = tasa > 0 ? round4(item.costoUnitario / tasa) : 0;
                }
                item.costoUnitario = round4((item.costoMoneda ?? 0) * tasa);
                item.costoTotal    = round2(item.cantidad * item.costoUnitario);
            } else {
                item.costoMoneda = null;
                item.tasaDolar   = null;
                // costoUnitario stays as-is (already in Bs)
                item.costoTotal  = round2(item.cantidad * item.costoUnitario);
            }
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (item as any)[field] = val;
            if (field === 'cantidad' || field === 'costoUnitario') {
                item.costoTotal = round2(Number(item.cantidad) * Number(item.costoUnitario));
                // Keep costoMoneda in sync when Bs cost changes directly (moneda='B')
                if (item.moneda !== 'D') item.costoMoneda = null;
            }
            if (field === 'productoId') {
                const producto = productos.find((p) => p.id === val);
                if (producto) {
                    // Auto-fill IVA from product
                    if (item.ivaAlicuota === 'general_16') {
                        item.ivaAlicuota = producto.ivaTipo === 'exento' ? 'exenta' : 'general_16';
                    }
                    // Auto-fill moneda from product's monedaDefecto
                    const newMoneda: MonedaItem = producto.monedaDefecto === 'D' ? 'D' : 'B';
                    item.moneda = newMoneda;
                    if (newMoneda === 'D') {
                        item.tasaDolar = tasaDolar ?? null;
                        // Don't pre-fill costoMoneda — user will type it
                        item.costoMoneda   = 0;
                        item.costoUnitario = 0;
                        item.costoTotal    = 0;
                    } else {
                        item.costoMoneda = null;
                        item.tasaDolar   = null;
                    }
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
            if (col < LAST_COL)   { focusCell(row, (col + 1) as ColIdx); }
            else if (row < lastRow) { focusCell(row + 1, 0); }
            else                    { addRow(row + 1); }
        } else if (dir === "shift-tab") {
            if (col > 0)          { focusCell(row, (col - 1) as ColIdx); }
            else if (row > 0)     { focusCell(row - 1, LAST_COL); }
        } else if (dir === "enter") {
            if (row < lastRow)    { focusCell(row + 1, col); }
            else                  { addRow(row + 1); }
        } else if (dir === "down") {
            if (row < lastRow)    { focusCell(row + 1, col); }
        } else if (dir === "up") {
            if (row > 0)          { focusCell(row - 1, col); }
        }
    }

    const hasTasaDolar = !!tasaDolar;
    const anyUsd = items.some((i) => i.moneda === 'D');

    return (
        <div className="overflow-x-auto">
            {/* Tasa hint */}
            {anyUsd && (
                <div className="mb-3 flex items-center gap-2 text-[12px]">
                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.14em]">Tasa BCV</span>
                    {hasTasaDolar ? (
                        <span className="font-mono tabular-nums text-amber-600 font-medium">
                            {tasaDolar!.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} Bs/USD
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
                        const isUsd = item.moneda === 'D';
                        return (
                            <tr
                                key={idx}
                                className="border-b border-border-light/30 hover:bg-surface-2/40 group"
                            >
                                {/* Producto */}
                                <td className="px-1 py-0.5">
                                    {readOnly ? (
                                        <span className="px-2 text-foreground text-[11px]">{item.productoNombre ?? item.productoId}</span>
                                    ) : (
                                        <ProductComboCell
                                            productoId={item.productoId}
                                            productos={productos}
                                            onSelect={(id) => updateItem(idx, "productoId", id)}
                                            onNavigate={(dir) => handleNavigate(idx, 0, dir)}
                                            registerRef={registerRef(idx, 0)}
                                            onRequestCreate={onRequestCreateProducto}
                                        />
                                    )}
                                </td>

                                {/* Cantidad */}
                                <td className="px-1 py-0.5">
                                    {readOnly ? (
                                        <span className="px-2 tabular-nums text-right block text-[var(--text-primary)] text-[13px]">{item.cantidad}</span>
                                    ) : (
                                        <NumberCell
                                            value={item.cantidad}
                                            onChange={(v) => updateItem(idx, "cantidad", v)}
                                            onNavigate={(dir) => handleNavigate(idx, 1, dir)}
                                            registerRef={registerRef(idx, 1)}
                                        />
                                    )}
                                </td>

                                {/* Moneda selector */}
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
                                            value={item.moneda ?? "B"}
                                            onChange={(e) => updateItem(idx, "moneda", e.target.value as MonedaItem)}
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

                                {/* Costo (USD input cuando D, Bs cuando B) */}
                                <td className="px-1 py-0.5">
                                    {readOnly ? (
                                        <span className="px-2 tabular-nums text-right block text-[var(--text-primary)] text-[13px]">
                                            {isUsd && item.costoMoneda != null
                                                ? `$${fmtN(item.costoMoneda)}`
                                                : fmtN(item.costoUnitario)}
                                        </span>
                                    ) : isUsd ? (
                                        <NumberCell
                                            value={item.costoMoneda ?? 0}
                                            onChange={(v) => updateItem(idx, "costoMonedaInput", v)}
                                            onNavigate={(dir) => handleNavigate(idx, 2, dir)}
                                            registerRef={registerRef(idx, 2)}
                                        />
                                    ) : (
                                        <NumberCell
                                            value={item.costoUnitario}
                                            onChange={(v) => updateItem(idx, "costoUnitario", v)}
                                            onNavigate={(dir) => handleNavigate(idx, 2, dir)}
                                            registerRef={registerRef(idx, 2)}
                                        />
                                    )}
                                </td>

                                {/* Costo Bs (readonly, solo cuando hay items USD) */}
                                {anyUsd && (
                                    <td className="px-3 py-0.5 tabular-nums text-right text-[var(--text-secondary)] text-[13px]">
                                        {isUsd
                                            ? (item.costoUnitario > 0 ? fmtN(item.costoUnitario) : "—")
                                            : <span className="text-[var(--text-tertiary)]">—</span>}
                                    </td>
                                )}

                                {/* Alícuota IVA */}
                                <td className="px-1 py-0.5">
                                    {readOnly ? (
                                        <span className={[
                                            "inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium",
                                            item.ivaAlicuota === "exenta"
                                                ? "bg-surface-2 text-[var(--text-tertiary)]"
                                                : item.ivaAlicuota === "reducida_8"
                                                  ? "bg-amber-500/10 text-amber-600"
                                                  : "bg-primary-500/10 text-primary-500",
                                        ].join(" ")}>
                                            {item.ivaAlicuota === "exenta" ? "Exenta" : item.ivaAlicuota === "reducida_8" ? "8%" : "16%"}
                                        </span>
                                    ) : (
                                        <select
                                            tabIndex={-1}
                                            value={item.ivaAlicuota ?? "general_16"}
                                            onChange={(e) => updateItem(idx, "ivaAlicuota", e.target.value as IvaAlicuota)}
                                            className="w-full h-8 px-1.5 outline-none bg-transparent text-[12px] text-foreground font-mono focus:bg-primary-500/[0.06] rounded transition-colors cursor-pointer"
                                        >
                                            <option value="exenta">Exenta (0%)</option>
                                            <option value="reducida_8">Reducida (8%)</option>
                                            <option value="general_16">General (16%)</option>
                                        </select>
                                    )}
                                </td>

                                {/* Costo total Bs (always readonly) */}
                                <td className="px-3 py-0.5 tabular-nums text-right text-[var(--text-primary)]">
                                    {item.costoTotal > 0 ? fmtN(item.costoTotal) : "—"}
                                </td>

                                {/* Remove */}
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
