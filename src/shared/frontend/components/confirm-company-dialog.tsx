"use client";

// ----------------------------------------------------------------------------
// ConfirmCompanyDialog — generic Konta-styled confirmation modal that always
// surfaces the active company prominently before persisting data. Used as
// the last barrier in flows that mutate inventory (purchase invoice confirm,
// manual entries, manual operations).
//
// Visual language matches AdjConfirmDialog / GenConfirmDialog (HeroUI Modal,
// font-mono uppercase chrome, surface-1 + border-light + rounded-2xl). The
// company context pill is highlighted with a primary-tinted border so the
// user can never miss which company they're committing to.
// ----------------------------------------------------------------------------

import type { ReactNode } from "react";
import { Modal, ModalContent, ModalBody } from "@heroui/react";
import { Building2, CheckCircle2, X, AlertTriangle } from "lucide-react";

import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";

export interface ConfirmCompanyDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    loading: boolean;

    title: string;
    subtitle?: ReactNode;

    /** Summary block (rows of label/value). Use SummaryRow exported below. */
    summary?: ReactNode;

    /** Optional amber warning shown above the action footer. */
    warning?: ReactNode;

    confirmLabel?: string;
    cancelLabel?: string;
    confirmIcon?: ReactNode;

    /** When true, footer button uses the danger variant (irreversible actions). */
    destructive?: boolean;
}

export function ConfirmCompanyDialog({
    isOpen,
    onClose,
    onConfirm,
    loading,
    title,
    subtitle,
    summary,
    warning,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    confirmIcon,
    destructive = false,
}: ConfirmCompanyDialogProps) {
    const { company } = useCompany();

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => { if (!open && !loading) onClose(); }}
            placement="center"
            isDismissable={!loading}
            hideCloseButton
            classNames={{
                base: "rounded-2xl border border-border-light bg-surface-1 shadow-xl max-w-[520px] w-full mx-4",
                backdrop: "backdrop-blur-sm bg-black/40",
            }}
        >
            <ModalContent>
                <ModalBody className="p-0">
                    {/* Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-border-light flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500 flex-shrink-0">
                            <Building2 size={16} strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-mono text-[15px] font-bold uppercase tracking-[0.14em] text-foreground leading-snug">
                                {title}
                            </h3>
                            {subtitle && (
                                <p className="font-sans text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            aria-label="Cerrar"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Empresa highlight — always present, primary-tinted */}
                    {company && (
                        <div className="px-6 pt-5">
                            <div className="rounded-xl border border-primary-500/30 bg-primary-500/[0.04] px-4 py-3 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-primary-500/15 border border-primary-500/30 flex items-center justify-center text-primary-500 flex-shrink-0">
                                    <Building2 size={14} strokeWidth={2.2} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-semibold">
                                        Registrar en
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-0.5 min-w-0">
                                        <span className="font-mono text-[14px] font-bold text-foreground truncate">
                                            {company.name}
                                        </span>
                                        {company.rif && (
                                            <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)] flex-shrink-0">
                                                · {company.rif}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Summary slot */}
                    {summary && (
                        <div className="px-6 pt-4 pb-2 space-y-2.5">
                            {summary}
                        </div>
                    )}

                    {/* Warning slot */}
                    {warning && (
                        <div className="px-6 pt-3 pb-1">
                            <div className="px-3.5 py-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] flex items-start gap-2.5">
                                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                <div className="font-sans text-[12px] text-amber-700 dark:text-amber-400 leading-relaxed">
                                    {warning}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="px-6 py-4 mt-4 border-t border-border-light bg-surface-2/40 flex items-center justify-end gap-3">
                        <BaseButton.Root
                            variant="secondary"
                            size="md"
                            onClick={onClose}
                            isDisabled={loading}
                        >
                            {cancelLabel}
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant={destructive ? "danger" : "primary"}
                            size="md"
                            onClick={() => { void onConfirm(); }}
                            loading={loading}
                            leftIcon={confirmIcon ?? <CheckCircle2 size={14} strokeWidth={2} />}
                        >
                            {confirmLabel}
                        </BaseButton.Root>
                    </div>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}

// ----------------------------------------------------------------------------
// SummaryRow — label/value row used inside ConfirmCompanyDialog summaries.
// Re-exported so callers don't have to invent their own; matches the Konta
// chrome (mono uppercase label, tabular-nums right-aligned value).
// ----------------------------------------------------------------------------

interface SummaryRowProps {
    label: string;
    value: ReactNode;
    emphasis?: boolean;
}

export function SummaryRow({ label, value, emphasis }: SummaryRowProps) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                {label}
            </span>
            <span
                className={[
                    "font-mono tabular-nums text-right",
                    emphasis
                        ? "text-[15px] font-bold text-foreground"
                        : "text-[13px] text-foreground",
                ].join(" ")}
            >
                {value}
            </span>
        </div>
    );
}
