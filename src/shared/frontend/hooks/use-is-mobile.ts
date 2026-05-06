"use client";

import { useSyncExternalStore } from "react";

const MOBILE_MQ = "(max-width: 767px)";

function subscribe(callback: () => void): () => void {
    const mq = window.matchMedia(MOBILE_MQ);
    mq.addEventListener("change", callback);
    return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
    return window.matchMedia(MOBILE_MQ).matches;
}

function getServerSnapshot(): boolean {
    return false;
}

export function useIsMobile(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
