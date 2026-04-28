"use client";

// Data hook for journal entries, optionally filtered by period.
import { useEffect, useState, useCallback } from 'react';
import type { JournalEntry }                 from '../../backend/domain/journal-entry';
import { apiFetch }                          from '@/src/shared/frontend/utils/api-fetch';
import { notify }                            from '@/src/shared/frontend/notify';

export function useJournalEntries(companyId: string | null, periodId?: string | null) {
    const [data,    setData]    = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        const qs = new URLSearchParams({ companyId });
        if (periodId) qs.set('periodId', periodId);
        setLoading(true);
        try {
            const res  = await apiFetch(`/api/accounting/entries?${qs.toString()}`);
            const json = await res.json() as { data?: JournalEntry[]; error?: string };
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar asientos'); return; }
            setData(json.data ?? []);
        } catch {
            notify.error('Error al cargar asientos');
        } finally {
            setLoading(false);
        }
    }, [companyId, periodId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, reload };
}
