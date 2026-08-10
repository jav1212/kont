"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BaseInput } from "@/src/shared/frontend/components/base-input";

interface CustomerOption {
    id?: string;
    name: string;
    rif?: string;
    active?: boolean;
}

interface CustomerComboboxProps {
    customerId: string;
    customers: CustomerOption[];
    onChange: (id: string) => void;
}

export function CustomerCombobox({ customerId, customers, onChange }: CustomerComboboxProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

    const selected = customers.find((customer) => customer.id === customerId);
    const query = search.trim().toLocaleLowerCase("es");
    const filtered = customers.filter((customer) =>
        customer.active !== false && (
            customer.name.toLocaleLowerCase("es").includes(query) ||
            (customer.rif ?? "").toLocaleLowerCase("es").includes(query)
        ),
    );

    useEffect(() => {
        const item = listRef.current?.children[highlightedIndex] as HTMLElement | undefined;
        item?.scrollIntoView({ block: "nearest" });
    }, [highlightedIndex]);

    useLayoutEffect(() => {
        if (!open) return;
        const updatePosition = () => {
            const rect = wrapperRef.current?.getBoundingClientRect();
            if (rect) setAnchor({ left: rect.left, top: rect.bottom + 2, width: rect.width });
        };
        updatePosition();
        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);
        return () => {
            window.removeEventListener("scroll", updatePosition, true);
            window.removeEventListener("resize", updatePosition);
        };
    }, [open]);

    function close() {
        setOpen(false);
        setSearch("");
    }

    function select(id: string) {
        onChange(id);
        close();
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (!open) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightedIndex((index) => Math.min(index + 1, filtered.length - 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === "Enter" && filtered[highlightedIndex]?.id) {
            event.preventDefault();
            select(filtered[highlightedIndex].id!);
        } else if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    }

    return (
        <div
            ref={wrapperRef}
            className="relative min-w-0 flex-1"
            onBlur={(event) => {
                const next = event.relatedTarget as Node | null;
                if (wrapperRef.current?.contains(next)) return;
                if (next && document.querySelector('[data-customer-combobox="true"]')?.contains(next)) return;
                close();
            }}
        >
            <BaseInput.Field
                value={open ? search : selected ? [selected.rif, selected.name].filter(Boolean).join(" · ") : ""}
                placeholder={open ? "Buscar cliente por nombre o RIF…" : "Seleccionar cliente…"}
                onValueChange={(value) => {
                    setSearch(value);
                    setHighlightedIndex(0);
                }}
                onFocus={() => {
                    setSearch("");
                    setHighlightedIndex(0);
                    setAnchor(null);
                    setOpen(true);
                }}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck="false"
            />
            {open && anchor && typeof document !== "undefined" && createPortal(
                <div
                    data-customer-combobox="true"
                    style={{ position: "fixed", left: anchor.left, top: anchor.top, width: anchor.width, zIndex: 100 }}
                    className="overflow-hidden rounded-lg border border-border-medium bg-surface-1 shadow-xl"
                >
                    {filtered.length === 0 ? (
                        <div className="px-3 py-3 text-[12px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Sin resultados</div>
                    ) : (
                        <ul ref={listRef} role="listbox" aria-label="Clientes disponibles" className="max-h-52 overflow-y-auto p-1.5">
                            {filtered.map((customer, index) => (
                                <li key={customer.id} role="option" aria-selected={customer.id === customerId}>
                                    <button
                                        type="button"
                                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] ${index === highlightedIndex ? "bg-primary-500/10 text-foreground" : "text-[var(--text-secondary)] hover:bg-surface-2"}`}
                                        onMouseDown={(event) => {
                                            event.preventDefault();
                                            select(customer.id!);
                                        }}
                                        onMouseEnter={() => setHighlightedIndex(index)}
                                    >
                                        <span className="min-w-[92px] font-mono text-[11px] text-[var(--text-tertiary)]">{customer.rif || "Sin RIF"}</span>
                                        <span className="truncate font-medium">{customer.name}</span>
                                    </button>
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
