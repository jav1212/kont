"use client";

// Data hook for journal entries, optionally filtered by period.
import { useEffect, useState, useCallback } from 'react';
import type { JournalEntry }                 from '../../backend/domain/journal-entry';

export function useJournalEntries(companyId: string | null, periodId?: string | null) {
    const [data,    setData]    = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        const qs = new URLSearchParams({ companyId });
        if (periodId) qs.set('periodId', periodId);
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch(`/api/accounting/entries?${qs.toString()}`);
            const json = await res.json() as { data?: JournalEntry[]; error?: string };
            if (!res.ok) { setError(json.error ?? 'Error'); return; }
            setData(json.data ?? []);
        } catch {
            setError('Error al cargar asientos');
        } finally {
            setLoading(false);
        }
    }, [companyId, periodId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, error, reload };
}
