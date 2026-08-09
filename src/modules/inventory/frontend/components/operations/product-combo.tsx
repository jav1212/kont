"use client";

// ProductCombo — searchable combobox with an inline IVA badge for a quick visual
// of the selected product's tax rate. Extracted from the three operation pages
// where it had been duplicated nearly verbatim.

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import type { Product } from "@/src/modules/inventory/backend/domain/product";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
    value: string;
    products: Product[];
    onChange: (id: string, name: string, vatRate: number) => void;
    size?: "sm" | "md" | "lg";
}

export function ProductCombo({ value, products, onChange, size = "md" }: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [hiIdx, setHiIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

    const selected = products.find((p) => p.id === value);
    const filtered = products
        .filter((p) => {
            const query = search.toLowerCase();
            return p.active !== false && (
                p.name.toLowerCase().includes(query) ||
                p.code.toLowerCase().includes(query)
            );
        })
        .slice(0, 12);

    useEffect(() => {
        const el = listRef.current?.children[hiIdx];
        if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest" });
    }, [hiIdx]);

    useLayoutEffect(() => {
        if (!open) return;
        const updateAnchor = () => {
            const input = wrapRef.current?.querySelector("input");
            const wrapperRect = wrapRef.current?.getBoundingClientRect();
            const inputRect = input?.getBoundingClientRect();
            if (wrapperRect) {
                setAnchor({
                    left: wrapperRect.left + window.scrollX,
                    top: (inputRect?.bottom ?? wrapperRect.bottom) + window.scrollY + 4,
                    width: Math.max(wrapperRect.width, 320),
                });
            }
        };
        updateAnchor();
        window.addEventListener("scroll", updateAnchor, true);
        window.addEventListener("resize", updateAnchor);
        return () => {
            window.removeEventListener("scroll", updateAnchor, true);
            window.removeEventListener("resize", updateAnchor);
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
        const related = e.relatedTarget;
        if (related instanceof Node && wrapRef.current?.contains(related)) return;
        if (related instanceof Node && document.querySelector('[data-product-combo-portal="true"]')?.contains(related)) return;
        setOpen(false);
        setSearch("");
    }

    const displayValue = open ? search : (selected?.name ?? "");

    return (
        <div ref={wrapRef} className="w-full" onBlur={handleBlur}>
            <div className="flex items-center gap-1.5">
                <BaseInput.Field
                    className="w-full"
                    size={size}
                    inputClassName="!h-10 !bg-surface-1"
                    value={displayValue}
                    placeholder={open ? "Buscar producto…" : "Seleccionar producto…"}
                    onValueChange={(v) => {
                        setSearch(v);
                        setHiIdx(0);
                    }}
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
                    style={{ position: "absolute", left: anchor.left, top: anchor.top, width: anchor.width, zIndex: 100 }}
                    className="overflow-hidden rounded-xl border border-border-light bg-surface-1 shadow-2xl"
                >
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">Sin resultados</div>
                    ) : (
                        <ul ref={listRef} className="max-h-64 overflow-y-auto py-1">
                            {filtered.map((p, i) => (
                                <li
                                    key={p.id}
                                    className={[
                                        "mx-1 cursor-pointer rounded-lg px-3 py-2 text-[13px] flex items-center gap-3",
                                        i === hiIdx ? "bg-primary-500/10 text-foreground" : "text-[var(--text-secondary)] hover:bg-surface-2",
                                    ].join(" ")}
                                    onMouseDown={(e) => { e.preventDefault(); select(p); }}
                                    onMouseEnter={() => setHiIdx(i)}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate">{p.name}</span>
                                        {p.code && <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--text-tertiary)]">Código {p.code}</span>}
                                    </span>
                                    <span className="text-[11px] text-[var(--text-tertiary)]">
                                        ({fmtN(p.currentStock)} {p.measureUnit})
                                    </span>
                                    <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                                        p.vatType === "general" ? "text-amber-600" : "text-[var(--text-tertiary)]"
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
