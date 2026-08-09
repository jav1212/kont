"use client";

import type { ReactNode } from "react";
import { Boxes, Calculator, FileText, Plus } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

interface InvoiceSectionCardProps {
    title: string;
    children: ReactNode;
    subtitle?: string;
    icon?: ReactNode;
    actions?: ReactNode;
    className?: string;
    bodyClassName?: string;
}

export function InvoiceSectionCard({
    title,
    children,
    subtitle,
    icon = <FileText size={14} strokeWidth={2} />,
    actions,
    className = "",
    bodyClassName = "p-6",
}: InvoiceSectionCardProps) {
    return (
        <section className={`overflow-hidden rounded-xl border border-border-light bg-surface-1 shadow-sm ${className}`}>
            <header className="flex items-start justify-between gap-4 border-b border-border-light px-6 py-5">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary-500/20 bg-primary-500/10 text-primary-500">{icon}</div>
                    <div className="min-w-0">
                        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">{title}</h2>
                        {subtitle && <p className="mt-1.5 font-sans text-[12px] leading-snug text-[var(--text-tertiary)]">{subtitle}</p>}
                    </div>
                </div>
                {actions}
            </header>
            <div className={bodyClassName}>{children}</div>
        </section>
    );
}

interface InvoiceDetailCardProps {
    count: number;
    children: ReactNode;
    title?: string;
    subtitle?: string;
    itemName?: string;
    emptyLabel?: string;
    readOnly?: boolean;
    onAddLine?: () => void;
    secondaryAction?: ReactNode;
    footer?: ReactNode;
    className?: string;
}

export function InvoiceDetailCard({
    count,
    children,
    title = "Detalle de la factura",
    subtitle,
    itemName = "producto",
    emptyLabel = "Sin productos",
    readOnly = false,
    onAddLine,
    secondaryAction,
    footer,
    className = "",
}: InvoiceDetailCardProps) {
    const countLabel = count === 0
        ? emptyLabel
        : `${count} ${count === 1 ? itemName : `${itemName}s`}`;

    return (
        <section className={`min-w-0 rounded-xl border border-border-light bg-surface-1 p-6 shadow-sm ${className}`}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary-500/20 bg-primary-500/10 text-primary-500">
                        <Boxes size={13} strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">{title}</h2>
                            <span className="inline-flex h-6 items-center justify-center rounded-full border border-border-light bg-surface-2 px-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                                {countLabel}
                            </span>
                        </div>
                        {subtitle && <p className="mt-1 font-sans text-[11px] text-[var(--text-tertiary)]">{subtitle}</p>}
                    </div>
                </div>
                {!readOnly && (
                    <div className="flex flex-wrap items-center gap-2">
                        {onAddLine && <BaseButton.Root variant="ghost" size="sm" leftIcon={<Plus size={13} strokeWidth={2} />} onClick={onAddLine}>Agregar línea</BaseButton.Root>}
                        {secondaryAction}
                    </div>
                )}
            </div>
            {children}
            {footer}
        </section>
    );
}

interface InvoiceSummaryCardProps {
    status: "draft" | "confirmed";
    children: ReactNode;
    title?: string;
    className?: string;
    contentClassName?: string;
}

export function InvoiceSummaryCard({ status, children, title = "Resumen", className = "", contentClassName = "p-5" }: InvoiceSummaryCardProps) {
    const confirmed = status === "confirmed";
    return (
        <section className={`w-full rounded-xl border border-border-light bg-surface-1 shadow-sm ${className}`}>
            <header className="flex items-center justify-between gap-3 border-b border-border-light px-5 py-4">
                <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-lg border border-primary-500/20 bg-primary-500/10 text-primary-500">
                        <Calculator size={15} strokeWidth={2} />
                    </div>
                    <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">{title}</h3>
                </div>
                <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${confirmed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                    {confirmed ? "Confirmada" : "Borrador"}
                </span>
            </header>
            <div className={contentClassName}>{children}</div>
        </section>
    );
}
