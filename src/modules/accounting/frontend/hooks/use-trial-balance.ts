"use client";

// Data hook for the trial balance report.
import { useEffect, useState, useCallback } from 'react';
import type { TrialBalanceLine } from '../../backend/domain/repository/journal-entry.repository';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';
import { notify } from '@/src/shared/frontend/notify';

export function useTrialBalance(companyId: string | null, periodId: string | null) {
    const [data,    setData]    = useState<TrialBalanceLine[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        const qs = new URLSearchParams({ companyId });
        if (periodId) qs.set('periodId', periodId);
        setLoading(true);
        try {
            const res  = await apiFetch(`/api/accounting/trial-balance?${qs.toString()}`);
            const json = await res.json() as { data?: TrialBalanceLine[]; error?: string };
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar balance'); return; }
            setData(json.data ?? []);
        } catch {
            notify.error('Error al cargar balance');
        } finally {
            setLoading(false);
        }
    }, [companyId, periodId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, reload };
}
