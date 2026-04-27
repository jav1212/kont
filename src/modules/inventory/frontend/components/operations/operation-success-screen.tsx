"use client";

// OperationSuccessScreen — confirmation screen shown after a successful save.

import { CheckCircle2, ArrowRight, ListChecks } from "lucide-react";

import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";

interface Props {
    pageTitle: string;
    successTitle: string;
    successMessage: string;
    primaryListLabel: string;
    primaryListPath: string;
    period: string;
}

export function OperationSuccessScreen({
    pageTitle, successTitle, successMessage,
    primaryListLabel, primaryListPath, period,
}: Props) {
    const router = useRouter();
    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title={pageTitle} subtitle="Operación registrada" />

            <div className="px-8 py-12 flex flex-col items-center">
                <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm w-full max-w-lg overflow-hidden">
                    <div className="px-8 pt-8 pb-6 flex flex-col items-center text-center border-b border-border-light/60">
                        <span className="inline-flex w-14 h-14 items-center justify-center rounded-full bg-green-500/10 border border-green-500/30 text-green-500 mb-4">
                            <CheckCircle2 size={28} strokeWidth={1.8} />
                        </span>
                        <div className="font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-foreground mb-2">
                            {successTitle}
                        </div>
                        <p className="font-sans text-[14px] leading-relaxed text-[var(--text-secondary)] max-w-sm">
                            {successMessage}
                        </p>
                    </div>

                    <div className="px-8 py-5 bg-surface-2 flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                            Período
                        </span>
                        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.10em] text-foreground tabular-nums">
                            {period}
                        </span>
                    </div>

                    <div className="px-8 py-5 flex flex-col gap-2 border-t border-border-light/60">
                        <BaseButton.Root
                            variant="primary"
                            size="md"
                            fullWidth
                            onClick={() => router.push(primaryListPath)}
                            rightIcon={<ArrowRight size={14} strokeWidth={2} />}
                        >
                            {primaryListLabel}
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="secondary"
                            size="md"
                            fullWidth
                            onClick={() => router.push(`/inventory/movements?periodo=${period}`)}
                            leftIcon={<ListChecks size={14} strokeWidth={2} />}
                        >
                            Ver movimientos del período
                        </BaseButton.Root>
                    </div>
                </div>
            </div>
        </div>
    );
}
