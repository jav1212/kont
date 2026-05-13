"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FLASH_MS = 1500;

async function writeClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // fall through to legacy fallback
        }
    }
    if (typeof document === "undefined") return false;
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

function hapticTap() {
    if (typeof navigator === "undefined") return;
    const n = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    n.vibrate?.(8);
}

/**
 * Lightweight clipboard hook for the divisas tool. Tracks which cell most
 * recently fired a copy so each call site can render its own inline "Copiado"
 * affordance without toast spam when the user taps several values in a row.
 */
export function useCopyAmount() {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const copy = useCallback(async (value: string, key?: string) => {
        const ok = await writeClipboard(value);
        if (!ok) return;
        hapticTap();
        const k = key ?? value;
        setCopiedKey(k);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopiedKey(null), FLASH_MS);
    }, []);

    return { copy, copiedKey };
}
