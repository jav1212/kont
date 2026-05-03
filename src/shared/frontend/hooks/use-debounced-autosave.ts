"use client";

// ----------------------------------------------------------------------------
// useDebouncedAutoSave — generic debounced auto-save hook.
//
// Watches a serializable payload. When it changes, schedules a save after
// `delayMs` of inactivity. If the payload changes again before the timer
// fires, the timer is reset. Tracks status so the UI can show "Guardando…"
// / "Guardado hace Xs" pill chrome alongside the company context.
//
// The save callback is captured in a ref so consumers can use closures over
// fresh state without resetting the timer on every render.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface UseDebouncedAutoSaveOptions<T> {
    payload: T;
    save: () => Promise<string | null | void>;
    isValid?: (payload: T) => boolean;
    delayMs?: number;
    enabled?: boolean;
}

export interface UseDebouncedAutoSaveResult {
    status: AutoSaveStatus;
    lastSavedAt: Date | null;
    error: string | null;
    flush: () => Promise<void>;
    reset: () => void;
}

export function useDebouncedAutoSave<T>({
    payload,
    save,
    isValid,
    delayMs = 2000,
    enabled = true,
}: UseDebouncedAutoSaveOptions<T>): UseDebouncedAutoSaveResult {
    const [status, setStatus] = useState<AutoSaveStatus>("idle");
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedJsonRef = useRef<string | null>(null);
    const inFlightRef = useRef<Promise<void> | null>(null);
    const saveRef = useRef(save);
    saveRef.current = save;

    const payloadJson = stableStringify(payload);
    const validNow = isValid ? isValid(payload) : true;

    const doSave = useCallback(async (): Promise<void> => {
        if (inFlightRef.current) return inFlightRef.current;
        const snapshot = lastSavedJsonRef.current;
        const currentJson = stableStringify(payload);
        if (currentJson === snapshot) {
            setStatus("saved");
            return;
        }
        setStatus("saving");
        setError(null);
        const run = (async () => {
            try {
                await saveRef.current();
                lastSavedJsonRef.current = currentJson;
                setLastSavedAt(new Date());
                setStatus("saved");
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Error al guardar";
                setError(msg);
                setStatus("error");
            } finally {
                inFlightRef.current = null;
            }
        })();
        inFlightRef.current = run;
        return run;
    }, [payload]);

    useEffect(() => {
        if (!enabled) return;
        if (lastSavedJsonRef.current === null) {
            // First render: snapshot the initial payload so we don't fire a
            // save on mount with empty/blank state.
            lastSavedJsonRef.current = payloadJson;
            return;
        }
        if (payloadJson === lastSavedJsonRef.current) return;
        if (!validNow) {
            setStatus("dirty");
            return;
        }
        setStatus("dirty");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            void doSave();
        }, delayMs);
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [payloadJson, validNow, enabled, delayMs, doSave]);

    const flush = useCallback(async (): Promise<void> => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!validNow) return;
        await doSave();
    }, [doSave, validNow]);

    const reset = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        lastSavedJsonRef.current = null;
        inFlightRef.current = null;
        setStatus("idle");
        setLastSavedAt(null);
        setError(null);
    }, []);

    return { status, lastSavedAt, error, flush, reset };
}

// Stable JSON.stringify with sorted object keys so two semantically equal
// payloads with different key order compare equal. Cheap enough for the
// payload sizes we handle (a factura draft is < 50KB serialized).
function stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, val) => {
        if (val && typeof val === "object" && !Array.isArray(val)) {
            const obj = val as Record<string, unknown>;
            return Object.keys(obj).sort().reduce<Record<string, unknown>>((acc, k) => {
                acc[k] = obj[k];
                return acc;
            }, {});
        }
        return val;
    });
}
