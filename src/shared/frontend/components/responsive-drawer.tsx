"use client";

import type { ReactNode } from "react";
import { Modal, ModalContent, ModalBody } from "@heroui/react";
import { X } from "lucide-react";

import { useIsMobile } from "@/src/shared/frontend/hooks/use-is-mobile";

interface ResponsiveDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: ReactNode;
    /** Header right slot (badges, status pills) */
    header?: ReactNode;
    /** Footer slot — usually action buttons */
    footer?: ReactNode;
    children: ReactNode;
    /** Disable dismiss on backdrop click / Esc */
    isDismissable?: boolean;
    /** Desktop modal size — defaults to "lg" */
    desktopSize?: "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
}

export function ResponsiveDrawer({
    isOpen,
    onClose,
    title,
    subtitle,
    header,
    footer,
    children,
    isDismissable = true,
    desktopSize = "lg",
}: ResponsiveDrawerProps) {
    const isMobile = useIsMobile();

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => { if (!open) onClose(); }}
            placement={isMobile ? "bottom" : "center"}
            size={isMobile ? "full" : desktopSize}
            scrollBehavior="inside"
            isDismissable={isDismissable}
            hideCloseButton
            classNames={{
                wrapper: isMobile
                    ? "items-end"
                    : "items-center",
                base: [
                    "border border-border-light bg-surface-1 shadow-xl",
                    "m-0",
                    isMobile
                        ? "rounded-t-2xl rounded-b-none max-h-[92dvh] w-full max-w-full"
                        : "rounded-2xl mx-4",
                ].join(" "),
                backdrop: "backdrop-blur-sm bg-black/40",
                body: "p-0",
            }}
        >
            <ModalContent>
                <ModalBody>
                    {/* Drag handle (mobile only, decorative) */}
                    {isMobile && (
                        <div className="flex justify-center pt-2 pb-1">
                            <span
                                aria-hidden="true"
                                className="block h-1 w-10 rounded-full bg-border-default/40"
                            />
                        </div>
                    )}

                    {/* Header */}
                    <div className="flex items-start gap-3 border-b border-border-light px-5 py-4">
                        <div className="min-w-0 flex-1">
                            <h3 className="font-mono text-[14px] font-bold uppercase tracking-[0.14em] text-foreground leading-snug truncate">
                                {title}
                            </h3>
                            {subtitle && (
                                <p className="mt-1 font-sans text-[13px] text-[var(--text-secondary)] leading-relaxed">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                        {header && <div className="flex-shrink-0">{header}</div>}
                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                            aria-label="Cerrar"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Body — scroll inside */}
                    <div className="flex-1 overflow-y-auto px-5 py-4">
                        {children}
                    </div>

                    {/* Footer */}
                    {footer && (
                        <div
                            className={[
                                "flex items-center justify-end gap-2.5",
                                "border-t border-border-light bg-surface-2/40 px-5 py-3.5",
                                isMobile ? "pb-[max(0.875rem,env(safe-area-inset-bottom))]" : "",
                            ].join(" ")}
                        >
                            {footer}
                        </div>
                    )}
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
