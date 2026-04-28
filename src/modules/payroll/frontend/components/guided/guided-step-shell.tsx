"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

interface GuidedStepShellProps {
    title: string;
    subtitle?: string;
    children: ReactNode;
    /** Optional content rendered next to the Anterior/Siguiente buttons (e.g. a "Guardar configuración" button). */
    footerExtra?: ReactNode;
    onBack?: () => void;
    onNext?: () => void;
    nextLabel?: string;
    nextDisabled?: boolean;
    /** Hide the default Anterior/Siguiente cluster — the page renders its own footer. */
    hideNav?: boolean;
}

// Generous-padding chassis for each wizard step. Mid-aged users benefit from
// large titles and breathing room: title 22px, subtitle 14px, content padded.
export function GuidedStepShell({
    title,
    subtitle,
    children,
    footerExtra,
    onBack,
    onNext,
    nextLabel = "Siguiente",
    nextDisabled = false,
    hideNav = false,
}: GuidedStepShellProps) {
    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto px-8 py-8">
                    <header className="mb-6">
                        <h2 className="font-mono text-[22px] font-black tracking-tight text-foreground leading-tight">
                            {title}
                        </h2>
                        {subtitle && (
                            <p className="font-mono text-[14px] text-[var(--text-secondary)] mt-2 leading-relaxed">
                                {subtitle}
                            </p>
                        )}
                    </header>
                    <div className="space-y-6">{children}</div>
                </div>
            </div>

            {!hideNav && (
                <div className="border-t border-border-light bg-surface-1 px-8 py-4">
                    <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
                        <div>
                            {onBack && (
                                <BaseButton.Root
                                    variant="secondary"
                                    size="md"
                                    onClick={onBack}
                                    leftIcon={<ArrowLeft size={16} />}
                                >
                                    Anterior
                                </BaseButton.Root>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {footerExtra}
                            {onNext && (
                                <BaseButton.Root
                                    variant="primary"
                                    size="md"
                                    onClick={onNext}
                                    isDisabled={nextDisabled}
                                    rightIcon={<ArrowRight size={16} />}
                                >
                                    {nextLabel}
                                </BaseButton.Root>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Reusable section wrapper for inline blocks inside a step.
export function StepSection({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-xl border border-border-light bg-surface-1 px-6 py-5">
            <h3 className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)] mb-1">
                {title}
            </h3>
            {description && (
                <p className="font-mono text-[13px] text-[var(--text-tertiary)] mb-4 leading-relaxed">
                    {description}
                </p>
            )}
            <div className={description ? "" : "mt-2"}>{children}</div>
        </section>
    );
}

// Collapsible "Avanzado" sub-section to keep the surface uncluttered for
// non-power users while still giving access to fine-grained controls.
export function AdvancedDisclosure({
    label = "Avanzado",
    children,
    defaultOpen = false,
}: {
    label?: string;
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    return (
        <details
            className="group rounded-xl border border-dashed border-border-light bg-surface-1/40"
            {...(defaultOpen ? { open: true } : {})}
        >
            <summary className="cursor-pointer px-5 py-3 list-none flex items-center justify-between hover:bg-foreground/[0.02] transition-colors rounded-xl">
                <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--text-secondary)] group-open:text-foreground">
                    {label}
                </span>
                <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="text-[var(--text-tertiary)] transition-transform duration-200 group-open:rotate-180"
                >
                    <path d="M2 4l3 3 3-3" />
                </svg>
            </summary>
            <div className="px-5 pb-5 pt-1 space-y-4">{children}</div>
        </details>
    );
}
