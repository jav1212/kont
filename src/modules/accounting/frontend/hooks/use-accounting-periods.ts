"use client";

// Data hook for accounting periods.
import { useEffect, useState, useCallback } from 'react';
import type { AccountingPeriod }             from '../../backend/domain/accounting-period';
import { apiFetch }                         from '@/src/shared/frontend/utils/api-fetch';
import { notify }                           from '@/src/shared/frontend/notify';

export function useAccountingPeriods(companyId: string | null) {
    const [data,    setData]    = useState<AccountingPeriod[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        setLoading(true);
        try {
            const res  = await apiFetch(`/api/accounting/periods?companyId=${companyId}`);
            const json = await res.json() as { data?: AccountingPeriod[]; error?: string };
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar períodos'); return; }
            setData(json.data ?? []);
        } catch {
            notify.error('Error al cargar períodos');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, reload };
}
