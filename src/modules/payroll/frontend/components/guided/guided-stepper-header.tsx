"use client";

import { Fragment } from "react";
import { Check } from "lucide-react";

export interface StepDef {
    id: number;
    label: string;
}

interface GuidedStepperHeaderProps {
    steps: StepDef[];
    currentStep: number;
    onStepClick: (step: number) => void;
}

// Big-text, large-touch-target step indicator. Visited steps are clickable so
// the user can revisit; future steps are disabled. Primary accent on active.
//
// Desktop (md+): alternating button/connector inside a flex row. Connectors use
// flex-1 so they absorb the remaining space; buttons keep their intrinsic
// width. This keeps the first circle pinned to the start and the last circle
// pinned to the end of the max-w-4xl track.
//
// Mobile (< md): "Paso N de M · Label" + a horizontal progress bar. The full
// 5-step row with text labels does not fit in a 360px viewport.
export function GuidedStepperHeader({ steps, currentStep, onStepClick }: GuidedStepperHeaderProps) {
    const total = steps.length;
    const current = steps.find((s) => s.id === currentStep) ?? steps[0];
    const progressPct = Math.round((currentStep / total) * 100);
    const canGoBack = currentStep > 1;

    return (
        <div className="border-b border-border-light bg-surface-1">
            {/* Mobile compact stepper */}
            <div className="md:hidden px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] tabular-nums shrink-0">
                            Paso {currentStep}/{total}
                        </span>
                        <span className="font-mono text-[13px] font-bold uppercase tracking-[0.12em] text-foreground truncate">
                            {current.label}
                        </span>
                    </div>
                    {canGoBack && (
                        <button
                            type="button"
                            onClick={() => onStepClick(currentStep - 1)}
                            className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] hover:text-primary-500 transition-colors"
                        >
                            ← Atrás
                        </button>
                    )}
                </div>
                <div className="h-1 rounded-full bg-border-light overflow-hidden">
                    <div
                        className="h-full bg-primary-500 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            </div>

            {/* Desktop full stepper */}
            <div className="hidden md:block px-8 py-5">
                <div className="flex items-center max-w-4xl mx-auto">
                    {steps.map((step, idx) => {
                        const isCurrent = step.id === currentStep;
                        const isDone = step.id < currentStep;
                        const isFuture = step.id > currentStep;
                        const canClick = !isFuture;

                        return (
                            <Fragment key={step.id}>
                                {idx > 0 && (
                                    <div
                                        className={[
                                            "flex-1 h-0.5 mx-3 -mt-7 transition-colors",
                                            step.id <= currentStep ? "bg-primary-500/50" : "bg-border-light",
                                        ].join(" ")}
                                    />
                                )}
                                <button
                                    onClick={() => canClick && onStepClick(step.id)}
                                    disabled={!canClick}
                                    className={[
                                        "flex flex-col items-center gap-2 group transition-opacity shrink-0",
                                        canClick ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                                    ].join(" ")}
                                >
                                    <span
                                        className={[
                                            "w-10 h-10 rounded-full border-2 flex items-center justify-center font-mono text-[15px] font-bold tabular-nums transition-all",
                                            isCurrent
                                                ? "bg-primary-500 border-primary-500 text-white shadow-md scale-110"
                                                : isDone
                                                    ? "bg-primary-500/15 border-primary-500/50 text-primary-500"
                                                    : "bg-surface-2 border-border-medium text-[var(--text-tertiary)]",
                                            canClick && !isCurrent ? "group-hover:border-primary-500/70" : "",
                                        ].join(" ")}
                                    >
                                        {isDone ? <Check size={18} strokeWidth={3} /> : step.id}
                                    </span>
                                    <span
                                        className={[
                                            "font-mono text-[12px] uppercase tracking-[0.14em] transition-colors whitespace-nowrap",
                                            isCurrent
                                                ? "text-foreground font-bold"
                                                : isDone
                                                    ? "text-[var(--text-secondary)]"
                                                    : "text-[var(--text-tertiary)]",
                                        ].join(" ")}
                                    >
                                        {step.label}
                                    </span>
                                </button>
                            </Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
