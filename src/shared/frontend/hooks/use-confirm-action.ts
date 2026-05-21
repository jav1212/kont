"use client";

// ----------------------------------------------------------------------------
// useConfirmAction — single-slot orchestration hook for `ConfirmCompanyDialog`.
//
// Holds at most one PendingAction at a time (a user only confirms one thing at
// a time). Exposes `request()` to enqueue, `clear()` to dismiss, and `confirm()`
// to run + auto-close. While the action is running, `loading` is true and the
// caller should keep the dialog `isDismissable={false}` (ConfirmCompanyDialog
// already does this when `loading` is true).
//
// Designed to be paired with a single <ConfirmCompanyDialog> mounted by the
// caller, driven by `pending` / `loading` / `clear` / `confirm`.
// ----------------------------------------------------------------------------

import { useCallback, useState } from "react";
import type { ReactNode } from "react";

export interface PendingAction {
    title:          string;
    subtitle?:      ReactNode;
    summary?:       ReactNode;
    warning?:       ReactNode;
    confirmLabel?:  string;
    confirmIcon?:   ReactNode;
    destructive?:   boolean;
    run:            () => void | Promise<void>;
}

export function useConfirmAction() {
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [loading, setLoading] = useState(false);

    const request = useCallback((action: PendingAction) => {
        setPending(action);
    }, []);

    const clear = useCallback(() => {
        if (loading) return;
        setPending(null);
    }, [loading]);

    const confirm = useCallback(async () => {
        if (!pending) return;
        setLoading(true);
        try {
            await pending.run();
        } finally {
            setLoading(false);
            setPending(null);
        }
    }, [pending]);

    return { pending, loading, request, clear, confirm };
}
