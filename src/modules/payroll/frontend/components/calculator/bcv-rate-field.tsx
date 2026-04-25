"use client";

import { RefreshCw } from "lucide-react";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { SectionHeader } from "./chrome";

// Calculator-flavour BCV rate widget. Renders the section label, a tiny
// refresh button, and the editable rate input. Left-panel use only —
// the marketing pill / read-only header chip live in `bcv-pill.tsx`.

export interface BcvRateFieldProps {
    /** rate string for controlled <input> binding */
    value:        string;
    onChange(next: string): void;
    onRefresh():  void | Promise<void>;
    loading?:     boolean;
    error?:       string | null;
    /** override section label (defaults to "Tasa BCV") */
    label?:       string;
}

export function BcvRateField({
    value, onChange, onRefresh, loading, error, label = "Tasa BCV",
}: BcvRateFieldProps) {
    return (
        <div className="space-y-1">
            <SectionHeader
                label={label}
                right={
                    <button
                        type="button"
                        onClick={() => { void onRefresh(); }}
                        disabled={!!loading}
                        className="p-1 hover:bg-surface-2 rounded-md transition-colors text-[var(--text-tertiary)] hover:text-primary-500 disabled:opacity-40"
                        title="Actualizar tasa"
                        aria-label="Actualizar tasa BCV"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                    </button>
                }
            />
            <BaseInput.Field
                type="number"
                step={0.01}
                value={value}
                onValueChange={onChange}
                prefix="Bs."
                inputClassName="text-right"
            />
            {error && (
                <p className="font-mono text-[10px] text-red-400 mt-1">{error}</p>
            )}
        </div>
    );
}
