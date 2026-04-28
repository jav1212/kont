"use client";

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
export function GuidedStepperHeader({ steps, currentStep, onStepClick }: GuidedStepperHeaderProps) {
    return (
        <div className="px-8 py-5 border-b border-border-light bg-surface-1">
            <div className="flex items-center justify-between max-w-3xl mx-auto">
                {steps.map((step, idx) => {
                    const isCurrent = step.id === currentStep;
                    const isDone = step.id < currentStep;
                    const isFuture = step.id > currentStep;
                    const canClick = !isFuture;

                    return (
                        <div key={step.id} className="flex items-center flex-1">
                            <button
                                onClick={() => canClick && onStepClick(step.id)}
                                disabled={!canClick}
                                className={[
                                    "flex flex-col items-center gap-2 group transition-opacity",
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
                                        "font-mono text-[12px] uppercase tracking-[0.14em] transition-colors",
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
                            {idx < steps.length - 1 && (
                                <div
                                    className={[
                                        "flex-1 h-0.5 mx-3 -mt-7 transition-colors",
                                        isDone ? "bg-primary-500/50" : "bg-border-light",
                                    ].join(" ")}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
