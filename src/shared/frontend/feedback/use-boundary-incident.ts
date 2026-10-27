"use client";

import { useEffect, useState } from "react";
import { isChunkLoadError, recoverFromChunkLoadError } from "./chunk-load-recovery";
import { resolveUnexpectedWebFailure } from "./web-feedback";

export type BoundaryIncident =
    | { readonly status: "reporting" }
    | { readonly status: "reloading" }
    | { readonly status: "recorded"; readonly code: string }
    | { readonly status: "unrecorded" };

/**
 * Reports a render failure caught by a Next.js error boundary and exposes the incident reference to show.
 * Boundaries render the reference themselves instead of a toast because the tree hosting the Toaster may be gone.
 * Re-renders of the same error reuse the reference through the reporter's deduplication window.
 * A stale-build chunk failure triggers one reload instead of a report.
 * @param error - Error received by the boundary; `digest` correlates with server logs.
 * @param eventName - Stable lowercase event name identifying the boundary.
 * @returns The reporting state and, once recorded, the incident code.
 */
export function useBoundaryIncident(error: Error & { digest?: string }, eventName: string): BoundaryIncident {
    const [incident, setIncident] = useState<BoundaryIncident>({ status: "reporting" });

    useEffect(() => {
        let active = true;
        if (recoverFromChunkLoadError(error)) return () => { active = false; };
        console.error(`[${eventName}]`, error);
        void resolveUnexpectedWebFailure.execute({
            eventName,
            error,
            publicMessage: "Ocurrió un error inesperado.",
            fingerprint: `${eventName}:${error.digest ?? error.message.slice(0, 120)}`,
            attributes: error.digest ? { digest: error.digest } : undefined,
            route: window.location.pathname,
        }).then(({ incident: reference }) => {
            if (active) setIncident(reference ? { status: "recorded", code: reference.code } : { status: "unrecorded" });
        });
        return () => { active = false; };
    }, [error, eventName]);

    // While a chunk failure is pending, the effect is reloading the page; if the loop guard declined
    // the reload instead, the report below settles and replaces this state.
    if (incident.status === "reporting" && isChunkLoadError(error)) return { status: "reloading" };
    return incident;
}
