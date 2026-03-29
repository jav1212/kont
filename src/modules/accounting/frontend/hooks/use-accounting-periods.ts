"use client";

// Data hook for accounting periods.
import { useEffect, useState, useCallback } from 'react';
import type { AccountingPeriod }             from '../../backend/domain/accounting-period';

export function useAccountingPeriods(companyId: string | null) {
    const [data,    setData]    = useState<AccountingPeriod[]>([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch(`/api/accounting/periods?companyId=${companyId}`);
            const json = await res.json() as { data?: AccountingPeriod[]; error?: string };
            if (!res.ok) { setError(json.error ?? 'Error'); return; }
            setData(json.data ?? []);
        } catch {
            setError('Error al cargar períodos');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, error, reload };
}
