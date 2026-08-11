"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";
import type { Product } from "@/src/modules/inventory/backend/domain/product";

const fmtStock = (value: number) =>
    value.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface SalesLineComboboxProps {
    productId: string | null | undefined;
    description: string;
    products: Product[];
    readOnly?: boolean;
    onProductSelect: (product: Product) => void;
    onFreeTextChange: (value: string) => void;
    onClear: () => void;
}

export function SalesLineCombobox({
    productId,
    description,
    products,
    readOnly = false,
    onProductSelect,
    onFreeTextChange,
    onClear,
}: SalesLineComboboxProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlighted, setHighlighted] = useState(0);
    const [anchor, setAnchor] = useState<{ left: number; top: number; width: number; listHeight: number } | null>(null);

    const selected = products.find((product) => product.id === productId);
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    const filtered = useMemo(() => products
        .filter((product) => product.active !== false)
        .filter((product) => {
            if (!normalizedQuery) return true;
            return product.name.toLocaleLowerCase("es").includes(normalizedQuery)
                || product.code.toLocaleLowerCase("es").includes(normalizedQuery)
                || (product.barcode?.toLocaleLowerCase("es").includes(normalizedQuery) ?? false);
        })
        .slice(0, 14), [products, normalizedQuery]);

    useLayoutEffect(() => {
        if (!open) return;
        const updateAnchor = () => {
            const rect = rootRef.current?.getBoundingClientRect();
            if (!rect) return;
            const panelChrome = 78;
            const preferredListHeight = 224;
            const gap = 5;
            const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
            const spaceAbove = rect.top - gap - 8;
            const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
            const available = Math.max(120, (openAbove ? spaceAbove : spaceBelow) - panelChrome);
            const listHeight = Math.min(preferredListHeight, available);
            setAnchor({
                left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 380) - 8)),
                top: openAbove
                    ? Math.max(8, rect.top - panelChrome - listHeight - gap)
                    : rect.bottom + gap,
                width: Math.min(Math.max(rect.width, 380), window.innerWidth - 16),
                listHeight,
            });
        };
        updateAnchor();
        window.addEventListener("resize", updateAnchor);
        return () => window.removeEventListener("resize", updateAnchor);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const closeOnExternalScroll = (event: Event) => {
            if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
            setOpen(false);
        };
        window.addEventListener("scroll", closeOnExternalScroll, true);
        return () => window.removeEventListener("scroll", closeOnExternalScroll, true);
    }, [open]);

    useEffect(() => {
        const row = listRef.current?.children[highlighted];
        if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
    }, [highlighted]);

    function openMenu() {
        setQuery(selected ? "" : description);
        setHighlighted(0);
        setOpen(true);
    }

    function choose(product: Product) {
        onProductSelect(product);
        setQuery("");
        setOpen(false);
    }

    function handleChange(value: string) {
        if (selected) onClear();
        setQuery(value);
        setHighlighted(0);
        onFreeTextChange(value);
        setOpen(true);
    }

    function handleBlur(event: React.FocusEvent) {
        const next = event.relatedTarget;
        if (next instanceof Node && rootRef.current?.contains(next)) return;
        if (next instanceof Node && panelRef.current?.contains(next)) return;
        setOpen(false);
        setQuery("");
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) openMenu();
            else setHighlighted((current) => Math.min(current + 1, filtered.length - 1));
        } else if (event.key === "ArrowUp" && open) {
            event.preventDefault();
            setHighlighted((current) => Math.max(current - 1, 0));
        } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (filtered[highlighted]) choose(filtered[highlighted]);
            else setOpen(false);
        } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
            setQuery("");
        }
    }

    if (readOnly) {
        return (
            <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-foreground">{description || "—"}</div>
                {selected && (
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                        {selected.code && <span>{selected.code}</span>}
                        <span>{fmtStock(selected.currentStock)} {selected.measureUnit}</span>
                    </div>
                )}
            </div>
        );
    }

    const displayValue = open ? query : (selected?.name ?? description);

    return (
        <div ref={rootRef} className="relative min-w-0" onBlur={handleBlur}>
            <Search size={14} strokeWidth={1.9} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
                data-slot="input"
                value={displayValue}
                onChange={(event) => handleChange(event.target.value)}
                onFocus={openMenu}
                onKeyDown={handleKeyDown}
                placeholder="Buscar producto o escribir servicio…"
                autoComplete="off"
                spellCheck={false}
                className="h-10 w-full rounded-lg border border-[var(--control-border)] bg-surface-1 pl-9 pr-9 font-sans text-[13px] text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[var(--control-placeholder)] hover:border-[var(--control-border-hover)] focus:border-[var(--control-border-focus)] focus:shadow-[var(--control-focus-shadow)]"
            />
            {(selected || description) && (
                <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => { onClear(); setQuery(""); setOpen(true); }}
                    className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-surface-2 hover:text-foreground"
                    aria-label="Limpiar línea"
                >
                    <X size={13} />
                </button>
            )}

            {open && anchor && typeof document !== "undefined" && createPortal(
                <div
                    ref={panelRef}
                    style={{ position: "fixed", left: anchor.left, top: anchor.top, width: anchor.width, zIndex: 100 }}
                    className="overflow-hidden rounded-lg border border-[var(--control-border)] bg-surface-1 shadow-[0_12px_28px_rgba(0,0,0,.12),0_2px_6px_rgba(0,0,0,.06)]"
                >
                    <div className="border-b border-border-light px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                        Productos disponibles
                    </div>
                    {filtered.length > 0 ? (
                        <div ref={listRef} style={{ maxHeight: anchor.listHeight }} className="overflow-y-auto overscroll-contain p-1.5">
                            {filtered.map((product, index) => (
                                <button
                                    key={product.id}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => choose(product)}
                                    onMouseEnter={() => setHighlighted(index)}
                                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                                        index === highlighted ? "bg-surface-2 text-foreground" : "text-[var(--text-secondary)] hover:bg-surface-2"
                                    }`}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate text-[13px] font-medium">{product.name}</span>
                                        <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                                            {product.code || "Sin código"}{product.barcode ? ` · ${product.barcode}` : ""} · {fmtStock(product.currentStock)} {product.measureUnit}
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <span className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                                            product.vatType === "exento" ? "bg-surface-3 text-[var(--text-tertiary)]" : "bg-primary-500/10 text-primary-500"
                                        }`}>
                                            {product.vatType === "exento" ? "Exento" : "IVA 16%"}
                                        </span>
                                        {selected?.id === product.id && <Check size={14} className="text-primary-500" />}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="px-4 py-5 text-center font-sans text-[12px] text-[var(--text-tertiary)]">
                            Sin productos coincidentes. El texto se guardará como servicio.
                        </div>
                    )}
                    <div className="border-t border-border-light bg-surface-2/40 px-3 py-2 font-sans text-[11px] text-[var(--text-tertiary)]">
                        Escribe libremente para registrar un servicio · Esc para cerrar
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
