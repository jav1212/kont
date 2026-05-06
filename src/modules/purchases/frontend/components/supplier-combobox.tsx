"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BaseInput } from "@/src/shared/frontend/components/base-input";

export interface SupplierComboboxOption {
    id?: string;
    name: string;
    rif?: string;
    active?: boolean;
}

interface SupplierComboboxProps {
    supplierId: string;
    suppliers: SupplierComboboxOption[];
    onChange: (id: string) => void;
    onRequestCreate: (search: string) => void;
}

export function SupplierCombobox({
    supplierId,
    suppliers,
    onChange,
    onRequestCreate,
}: SupplierComboboxProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [hiIdx, setHiIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

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

    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const el = wrapRef.current;
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

    function openDropdown() {
        setSearch("");
        setHiIdx(0);
        setAnchor(null);
        setOpen(true);
    }
    function closeDropdown() {
        setOpen(false);
        setSearch("");
    }
    function selectItem(id: string) {
        onChange(id);
        closeDropdown();
    }

    function handleBlur(e: React.FocusEvent) {
        const next = e.relatedTarget as Node | null;
        if (wrapRef.current?.contains(next)) return;
        if (
            next instanceof Node &&
            document.querySelector('[data-supplier-combo-portal="true"]')?.contains(next)
        ) {
            return;
        }
        closeDropdown();
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
                if (filtered[hiIdx]) selectItem(filtered[hiIdx].id!);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                closeDropdown();
                return;
            }
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
                onValueChange={(v) => {
                    setSearch(v);
                    setHiIdx(0);
                }}
                onFocus={openDropdown}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck="false"
            />
            {open && anchor && typeof document !== "undefined" &&
                createPortal(
                    <div
                        data-supplier-combo-portal="true"
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
                            <div className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                                Sin resultados
                            </div>
                        ) : (
                            <ul ref={listRef} className="max-h-52 overflow-y-auto">
                                {filtered.map((s, i) => (
                                    <li
                                        key={s.id}
                                        className={[
                                            "px-3 py-2 cursor-pointer flex items-center gap-2 text-[13px]",
                                            i === hiIdx
                                                ? "bg-primary-500/10 text-foreground"
                                                : "text-[var(--text-secondary)] hover:bg-surface-2",
                                        ].join(" ")}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            selectItem(s.id!);
                                        }}
                                        onMouseEnter={() => setHiIdx(i)}
                                    >
                                        {s.rif && (
                                            <span className="font-mono text-[11px] text-[var(--text-tertiary)] min-w-[80px]">
                                                {s.rif}
                                            </span>
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
                            + Crear{search ? ` "${search}"` : " nuevo proveedor"}
                        </button>
                    </div>,
                    document.body,
                )}
        </div>
    );
}
