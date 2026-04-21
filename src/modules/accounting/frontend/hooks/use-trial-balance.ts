"use client";

// Data hook for the trial balance report.
// Mirrors the { data, loading, error, reload } contract used by all other accounting hooks.
import { useEffect, useState, useCallback } from 'react';
import type { TrialBalanceLine } from '../../backend/domain/repository/journal-entry.repository';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';

export function useTrialBalance(companyId: string | null, periodId: string | null) {
    const [data,    setData]    = useState<TrialBalanceLine[]>([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        const qs = new URLSearchParams({ companyId });
        if (periodId) qs.set('periodId', periodId);
        setLoading(true);
        setError(null);
        try {
            const res  = await apiFetch(`/api/accounting/trial-balance?${qs.toString()}`);
            const json = await res.json() as { data?: TrialBalanceLine[]; error?: string };
            if (!res.ok) { setError(json.error ?? 'Error'); return; }
            setData(json.data ?? []);
        } catch {
            setError('Error al cargar balance');
        } finally {
            setLoading(false);
        }
    }, [companyId, periodId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, error, reload };
}
