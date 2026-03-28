"use client";

import { useSyncExternalStore } from "react";

// Media query for the xl breakpoint (≥ 1280px = desktop).
const DESKTOP_MQ = "(min-width: 1280px)";

function subscribe(callback: () => void): () => void {
    const mq = window.matchMedia(DESKTOP_MQ);
    mq.addEventListener("change", callback);
    return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
    return window.matchMedia(DESKTOP_MQ).matches;
}

// SSR fallback — default to true so layouts don't flash an empty state.
function getServerSnapshot(): boolean {
    return true;
}

/**
 * Returns true when the viewport is ≥ 1280px (xl breakpoint = desktop).
 * Uses useSyncExternalStore to avoid setState-in-effect patterns.
 */
export function useIsDesktop(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
