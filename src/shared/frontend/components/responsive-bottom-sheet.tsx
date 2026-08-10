"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ResponsiveBottomSheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
    contentClassName?: string;
}

export function ResponsiveBottomSheet({
    open,
    onClose,
    title,
    subtitle,
    children,
    footer,
    contentClassName = "",
}: ResponsiveBottomSheetProps) {
    const titleId = useId();

    useEffect(() => {
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [onClose, open]);

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-[1100] md:hidden" role="presentation">
            <button
                type="button"
                aria-label="Cerrar"
                className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
                onClick={onClose}
            />
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="absolute inset-x-0 bottom-0 flex max-h-[min(88dvh,44rem)] flex-col overflow-hidden rounded-t-2xl border-t border-border-light bg-surface-1 shadow-[0_-16px_48px_rgba(0,0,0,0.22)]"
            >
                <div className="shrink-0 px-4 pb-3 pt-2">
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-medium" />
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 id={titleId} className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-foreground">{title}</h2>
                            {subtitle && <p className="mt-1 font-sans text-[12px] leading-snug text-[var(--text-tertiary)]">{subtitle}</p>}
                        </div>
                        <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-xl leading-none text-[var(--text-secondary)]">×</button>
                    </div>
                </div>
                <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${contentClassName}`}>{children}</div>
                {footer && <footer className="shrink-0 border-t border-border-light bg-surface-1 px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3">{footer}</footer>}
                {!footer && <div className="h-[max(0.5rem,env(safe-area-inset-bottom))] shrink-0" />}
            </section>
        </div>,
        document.body,
    );
}
