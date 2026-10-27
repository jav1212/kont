"use client";

import { useState } from "react";
import type { BoundaryIncident } from "./use-boundary-incident";

/**
 * Shows the incident reference of an error boundary with a copy control, announced politely to assistive technology.
 * @param props - Current boundary incident state.
 * @returns The reference line, a progress hint while reporting, or nothing when the incident could not be recorded.
 */
export function IncidentReference({ incident }: { readonly incident: BoundaryIncident }) {
    const [copied, setCopied] = useState(false);
    if (incident.status === "unrecorded") return null;

    return (
        <div aria-live="polite" className="flex items-center gap-3 font-mono text-[10px] tracking-widest text-[var(--text-disabled)]">
            {incident.status === "reporting" ? (
                <span>Registrando referencia…</span>
            ) : (
                <>
                    <span>CÓDIGO: <span className="select-all text-[var(--text-secondary)]">{incident.code}</span></span>
                    <button
                        type="button"
                        onClick={() => {
                            void navigator.clipboard?.writeText(incident.code).then(() => setCopied(true), () => undefined);
                        }}
                        className="uppercase tracking-[0.18em] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                    >
                        {copied ? "Copiado" : "Copiar"}
                    </button>
                </>
            )}
        </div>
    );
}
