"use client";

// Soft-delete with a 5-second undo window.
//
// Solves REQ-001 of IMPECCABLE_REQUIREMENTS.md: the original delete handlers
// fire the API request immediately and a misclick during rapid Enter-to-advance
// editing causes real data loss. With this hook the actual API call is delayed
// until the toast expires (or the page unmounts); during that window the
// affected items are filtered out of the visible list and the user can press
// "Deshacer" to abort.
//
// Usage:
//
//   const { pendingIds, requestDelete } = useUndoableDelete<string>({
//       onCommit: async (ids) => remove(ids),
//   });
//
//   const visible = items.filter(i => !pendingIds.has(i.id));
//
//   // To delete:
//   requestDelete(["123", "456"]);
//
// The hook is generic over the identifier type (string | number) so it can be
// reused across employees (cedula), products (codigo), invoices (id), etc.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notify } from "@/src/shared/frontend/notify";

interface UseUndoableDeleteOptions<T extends string | number> {
    /** Final commit. Should call the actual delete API. Returns true on success. */
    onCommit: (ids: T[]) => Promise<boolean>;
    /** Toast lifetime in ms before the delete is committed. Default: 5000. */
    duration?: number;
    /** Format the toast message based on count. */
    formatMessage?: (count: number) => string;
    /** Optional: invoked when the user undoes a batch. Useful for restoring selection. */
    onUndo?: (ids: T[]) => void;
}

interface PendingBatch<T> {
    ids:     T[];
    timer:   ReturnType<typeof setTimeout>;
    toastId: string | number;
    /** Set when `commit` runs to short-circuit duplicate commits. */
    committed: boolean;
}

export interface UseUndoableDeleteResult<T extends string | number> {
    /** Items currently in the undo window — hide them in the list. */
    pendingIds: Set<T>;
    /** Schedule a soft delete. */
    requestDelete: (ids: T[]) => void;
    /** Force-commit all pending batches immediately (idempotent). */
    flush: () => Promise<void>;
}

const DEFAULT_DURATION = 5000;
const DEFAULT_FORMAT = (count: number) =>
    count === 1 ? "1 elemento eliminado" : `${count} elementos eliminados`;

export function useUndoableDelete<T extends string | number>(
    opts: UseUndoableDeleteOptions<T>,
): UseUndoableDeleteResult<T> {
    const {
        onCommit,
        duration      = DEFAULT_DURATION,
        formatMessage = DEFAULT_FORMAT,
        onUndo,
    } = opts;

    const [pendingIds, setPendingIds] = useState<Set<T>>(() => new Set());
    const batchesRef = useRef<Map<string, PendingBatch<T>>>(new Map());

    // Refs that always point to the latest closure values, avoiding stale
    // capture inside the timer callback.
    const onCommitRef = useRef(onCommit);
    const onUndoRef   = useRef(onUndo);
    useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);
    useEffect(() => { onUndoRef.current   = onUndo;   }, [onUndo]);

    const removeFromPending = useCallback((ids: T[]) => {
        setPendingIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
        });
    }, []);

    const commitBatch = useCallback(async (batchId: string) => {
        const batch = batchesRef.current.get(batchId);
        if (!batch || batch.committed) return;
        batch.committed = true;
        clearTimeout(batch.timer);
        notify.dismiss(batch.toastId);

        const ok = await onCommitRef.current(batch.ids);
        // Whether commit succeeded or failed, the items leave the pending set
        // (failure restores them in the list — the underlying API call already
        // toasted the error via notify in the page handler).
        removeFromPending(batch.ids);
        batchesRef.current.delete(batchId);
        if (!ok) {
            // The data hook already calls notify.error on failure; nothing
            // extra to do here. The items reappear in the list because they
            // left pendingIds.
        }
    }, [removeFromPending]);

    const undoBatch = useCallback((batchId: string) => {
        const batch = batchesRef.current.get(batchId);
        if (!batch) return;
        clearTimeout(batch.timer);
        notify.dismiss(batch.toastId);
        batchesRef.current.delete(batchId);
        removeFromPending(batch.ids);
        onUndoRef.current?.(batch.ids);
        notify.info("Eliminación deshecha.");
    }, [removeFromPending]);

    const requestDelete = useCallback((ids: T[]) => {
        if (ids.length === 0) return;

        const batchId = `undo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Add to pending set immediately so the list hides them.
        setPendingIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.add(id));
            return next;
        });

        const toastId = notify.success(formatMessage(ids.length), {
            duration,
            action: {
                label:   "Deshacer",
                onClick: () => undoBatch(batchId),
            },
        });

        const timer = setTimeout(() => {
            void commitBatch(batchId);
        }, duration);

        batchesRef.current.set(batchId, {
            ids,
            timer,
            toastId,
            committed: false,
        });
    }, [duration, formatMessage, commitBatch, undoBatch]);

    const flush = useCallback(async () => {
        const batchIds = Array.from(batchesRef.current.keys());
        await Promise.all(batchIds.map((id) => commitBatch(id)));
    }, [commitBatch]);

    // On unmount: commit everything in flight so we don't leak undeleted rows.
    useEffect(() => {
        const map = batchesRef.current;
        return () => {
            map.forEach((_, id) => { void commitBatch(id); });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- stable refs are intentional
    }, []);

    return useMemo(() => ({
        pendingIds,
        requestDelete,
        flush,
    }), [pendingIds, requestDelete, flush]);
}
