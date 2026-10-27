"use client";

// Data hook for accounting charts (plan de cuentas).
import { useEffect, useState, useCallback } from 'react';
import type { AccountChart }               from '../../backend/domain/account-chart';
import { apiFetch }                        from '@/src/shared/frontend/utils/api-fetch';
import { notify }                          from '@/src/shared/frontend/notify';

export function useCharts(companyId: string | null) {
    const [data,    setData]    = useState<AccountChart[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        setLoading(true);
        try {
            const res  = await apiFetch(`/api/accounting/charts?companyId=${companyId}`);
            const json = await res.json() as { data?: AccountChart[]; error?: string };
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar planes de cuentas'); return; }
            setData(json.data ?? []);
        } catch {
            notify.error('Error al cargar planes de cuentas');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, reload };
}
