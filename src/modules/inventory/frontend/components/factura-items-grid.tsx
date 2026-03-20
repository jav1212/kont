"use client";

import { useState, useRef, useEffect } from "react";
import type { FacturaCompraItem } from "@/src/modules/inventory/backend/domain/factura-compra";
import type { Producto } from "@/src/modules/inventory/backend/domain/producto";

// ── types ─────────────────────────────────────────────────────────────────────

type ColIdx = 0 | 1 | 2; // 0=producto, 1=cantidad, 2=costoUnitario
type NavDir = "tab" | "shift-tab" | "enter" | "down" | "up";

interface Props {
    items: FacturaCompraItem[];
    productos: Producto[];
    onChange: (items: FacturaCompraItem[]) => void;
    readOnly?: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

export function emptyItem(): FacturaCompraItem {
    return { productoId: "", cantidad: 1, costoUnitario: 0, costoTotal: 0 };
}

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── ProductComboCell ──────────────────────────────────────────────────────────

interface ProductCellProps {
    productoId: string;
    productos: Producto[];
    onSelect: (id: string) => void;
    onNavigate: (dir: NavDir) => void;
    registerRef: (el: HTMLInputElement | null) => void;
}

function ProductComboCell({ productoId, productos, onSelect, onNavigate, registerRef }: ProductCellProps) {
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

    // Scroll highlighted item into view
    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.children[hiIdx] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
    }, [hiIdx]);

    function openDropdown() {
        setSearch("");
        setHiIdx(0);
        setOpen(true);
    }

    function closeDropdown() {
        setOpen(false);
        setSearch("");
    }

    function selectItem(id: string) {
        onSelect(id);
        closeDropdown();
    }

    function handleBlur(e: React.FocusEvent) {
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) {
            closeDropdown();
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        // When dropdown is open — arrow keys / enter / escape navigate it
        if (open) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setHiIdx((i) => Math.min(i + 1, filtered.length - 1));
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setHiIdx((i) => Math.max(i - 1, 0));
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[hiIdx]) {
                    selectItem(filtered[hiIdx].id!);
                    onNavigate("tab"); // move to cantidad after selecting
                }
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                closeDropdown();
                return;
            }
        }

        // Grid navigation
        if (e.key === "Tab") {
            e.preventDefault();
            closeDropdown();
            onNavigate(e.shiftKey ? "shift-tab" : "tab");
            return;
        }
        if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            onNavigate("down");
            return;
        }
        if (e.key === "ArrowUp" && !open) {
            e.preventDefault();
            onNavigate("up");
            return;
        }
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
                onChange={(e) => {
                    setSearch(e.target.value);
                    setHiIdx(0);
                }}
                onFocus={openDropdown}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
            />
            {open && (
                <div className="absolute left-0 top-full z-50 min-w-[300px] mt-0.5 rounded-lg border border-border-medium bg-surface-1 shadow-xl overflow-hidden">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2.5 text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.14em]">
                            Sin resultados
                        </div>
                    ) : (
                        <ul ref={listRef} className="max-h-52 overflow-y-auto">
                            {filtered.map((p, i) => (
                                <li
                                    key={p.id}
                                    className={[
                                        "px-3 py-2 cursor-pointer flex items-center gap-2 text-[11px]",
                                        i === hiIdx
                                            ? "bg-primary-500/10 text-foreground"
                                            : "text-[var(--text-secondary)] hover:bg-surface-2",
                                    ].join(" ")}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        selectItem(p.id!);
                                        onNavigate("tab");
                                    }}
                                    onMouseEnter={() => setHiIdx(i)}
                                >
                                    {p.codigo && (
                                        <span className="font-mono text-[10px] text-[var(--text-tertiary)] min-w-[48px]">
                                            {p.codigo}
                                        </span>
                                    )}
                                    <span className="truncate">{p.nombre}</span>
                                </li>
                            ))}
                        </ul>
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
        // Select all after state update
        requestAnimationFrame(() => e.target.select());
    }

    function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
        commit(e.target.value);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Tab") {
            e.preventDefault();
            commit(e.currentTarget.value);
            onNavigate(e.shiftKey ? "shift-tab" : "tab");
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget.value);
            onNavigate("enter");
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            commit(e.currentTarget.value);
            onNavigate("down");
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            commit(e.currentTarget.value);
            onNavigate("up");
            return;
        }
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
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
        />
    );
}

// ── FacturaItemsGrid ──────────────────────────────────────────────────────────

export function FacturaItemsGrid({ items, productos, onChange, readOnly = false }: Props) {
    const refs = useRef<Map<string, HTMLInputElement>>(new Map());

    function refKey(row: number, col: ColIdx) {
        return `${row}-${col}`;
    }

    function registerRef(row: number, col: ColIdx) {
        return (el: HTMLInputElement | null) => {
            if (el) refs.current.set(refKey(row, col), el);
            else refs.current.delete(refKey(row, col));
        };
    }

    function focusCell(row: number, col: ColIdx) {
        // Use setTimeout to allow React to render new rows first
        setTimeout(() => {
            refs.current.get(refKey(row, col))?.focus();
        }, 0);
    }

    function updateItem(idx: number, field: keyof FacturaCompraItem, val: unknown) {
        const next = [...items];
        const item = { ...next[idx], [field]: val };
        if (field === "cantidad" || field === "costoUnitario") {
            item.costoTotal =
                Math.round(Number(item.cantidad) * Number(item.costoUnitario) * 100) / 100;
        }
        next[idx] = item as FacturaCompraItem;
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
        const lastRow = items.length - 1;
        const LAST_COL = 2 as ColIdx;

        if (dir === "tab") {
            if (col < LAST_COL) {
                focusCell(row, (col + 1) as ColIdx);
            } else if (row < lastRow) {
                focusCell(row + 1, 0);
            } else {
                // Last cell of last row → add new row
                addRow(row + 1);
            }
        } else if (dir === "shift-tab") {
            if (col > 0) {
                focusCell(row, (col - 1) as ColIdx);
            } else if (row > 0) {
                focusCell(row - 1, LAST_COL);
            }
        } else if (dir === "enter") {
            if (row < lastRow) {
                focusCell(row + 1, col);
            } else {
                addRow(row + 1);
            }
        } else if (dir === "down") {
            if (row < lastRow) focusCell(row + 1, col);
        } else if (dir === "up") {
            if (row > 0) focusCell(row - 1, col);
        }
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
                <thead>
                    <tr className="border-b border-border-light">
                        <th className="px-2 py-2 text-left text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-normal">
                            Producto
                        </th>
                        <th className="px-2 py-2 text-right text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-normal w-28">
                            Cantidad
                        </th>
                        <th className="px-2 py-2 text-right text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-normal w-32">
                            Costo Unit.
                        </th>
                        <th className="px-2 py-2 text-right text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-normal w-32">
                            Costo Total
                        </th>
                        {!readOnly && <th className="w-8" />}
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => (
                        <tr
                            key={idx}
                            className="border-b border-border-light/30 hover:bg-surface-2/40 group"
                        >
                            {/* Producto */}
                            <td className="px-1 py-0.5">
                                {readOnly ? (
                                    <span className="px-2 text-foreground text-[11px]">
                                        {item.productoNombre ?? item.productoId}
                                    </span>
                                ) : (
                                    <ProductComboCell
                                        productoId={item.productoId}
                                        productos={productos}
                                        onSelect={(id) => updateItem(idx, "productoId", id)}
                                        onNavigate={(dir) => handleNavigate(idx, 0, dir)}
                                        registerRef={registerRef(idx, 0)}
                                    />
                                )}
                            </td>

                            {/* Cantidad */}
                            <td className="px-1 py-0.5">
                                {readOnly ? (
                                    <span className="px-2 tabular-nums text-right block text-[var(--text-primary)] text-[11px]">
                                        {item.cantidad}
                                    </span>
                                ) : (
                                    <NumberCell
                                        value={item.cantidad}
                                        onChange={(v) => updateItem(idx, "cantidad", v)}
                                        onNavigate={(dir) => handleNavigate(idx, 1, dir)}
                                        registerRef={registerRef(idx, 1)}
                                    />
                                )}
                            </td>

                            {/* Costo unitario */}
                            <td className="px-1 py-0.5">
                                {readOnly ? (
                                    <span className="px-2 tabular-nums text-right block text-[var(--text-primary)] text-[11px]">
                                        {fmtN(item.costoUnitario)}
                                    </span>
                                ) : (
                                    <NumberCell
                                        value={item.costoUnitario}
                                        onChange={(v) => updateItem(idx, "costoUnitario", v)}
                                        onNavigate={(dir) => handleNavigate(idx, 2, dir)}
                                        registerRef={registerRef(idx, 2)}
                                    />
                                )}
                            </td>

                            {/* Costo total (always read-only) */}
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
                    ))}
                </tbody>
            </table>

            {/* Add row */}
            {!readOnly && (
                <button
                    tabIndex={-1}
                    onClick={() => addRow(items.length)}
                    className="mt-2 ml-1 text-[10px] text-[var(--text-tertiary)] hover:text-foreground uppercase tracking-[0.14em] transition-colors"
                >
                    + agregar fila{" "}
                    <span className="normal-case opacity-40 ml-1 tracking-normal">
                        (Tab desde la última celda)
                    </span>
                </button>
            )}

            {/* Keyboard hint */}
            {!readOnly && (
                <p className="mt-3 ml-1 text-[9px] text-[var(--text-tertiary)] opacity-60 tracking-wide">
                    Tab · Shift+Tab — moverse entre celdas &nbsp;|&nbsp; Enter — bajar en la misma columna &nbsp;|&nbsp; ↑↓ — cambiar fila
                </p>
            )}
        </div>
    );
}
