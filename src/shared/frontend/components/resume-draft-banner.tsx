"use client";

// ----------------------------------------------------------------------------
// ResumeDraftBanner — banner shown at the top of "new" forms when a draft
// exists for the same company + entity type. Lets the user resume editing
// an in-progress record or discard it and start fresh.
//
// Visual: amber soft surface (badge-warning tones) — reads as a non-blocking
// hint, not an error.
// ----------------------------------------------------------------------------

import type { ReactNode } from "react";
import { History, Trash2, ArrowRight } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

export interface ResumeDraftBannerProps {
    /** Pre-formatted human label, e.g. "5 may · 14:32". Caller decides locale. */
    timestampLabel: string;
    /** Optional summary line — "3 ítems · Bs. 1.450,00". */
    summary?: ReactNode;
    onResume: () => void;
    onDiscard: () => void;
    discarding?: boolean;
    resuming?: boolean;
}

export function ResumeDraftBanner({
    timestampLabel,
    summary,
    onResume,
    onDiscard,
    discarding = false,
    resuming = false,
}: ResumeDraftBannerProps) {
    return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-5 py-3.5 flex items-center gap-4 flex-wrap">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 flex-shrink-0">
                <History size={16} strokeWidth={2} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400 font-bold">
                    Borrador sin confirmar
                </div>
                <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
                    <span className="font-sans text-[13px] text-foreground">
                        Guardado el <span className="font-mono tabular-nums">{timestampLabel}</span>
                    </span>
                    {summary && (
                        <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)] pl-2 border-l border-amber-500/30">
                            {summary}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                <BaseButton.Root
                    variant="ghost"
                    size="sm"
                    onClick={onDiscard}
                    loading={discarding}
                    isDisabled={resuming}
                    leftIcon={<Trash2 size={13} strokeWidth={2} />}
                >
                    Descartar
                </BaseButton.Root>
                <BaseButton.Root
                    variant="primary"
                    size="sm"
                    onClick={onResume}
                    loading={resuming}
                    isDisabled={discarding}
                    rightIcon={<ArrowRight size={13} strokeWidth={2} />}
                >
                    Reanudar
                </BaseButton.Root>
            </div>
        </div>
    );
}
