"use client";

// Data hook for the chart of accounts.
import { useEffect, useState, useCallback } from 'react';
import type { Account }                      from '../../backend/domain/account';
import { apiFetch }                         from '@/src/shared/frontend/utils/api-fetch';
import { notify }                           from '@/src/shared/frontend/notify';

export function useAccounts(companyId: string | null) {
    const [data,    setData]    = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        setLoading(true);
        try {
            const res = await apiFetch(`/api/accounting/accounts?companyId=${companyId}`);
            const json = await res.json() as { data?: Account[]; error?: string };
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar cuentas'); return; }
            setData(json.data ?? []);
        } catch {
            notify.error('Error al cargar cuentas');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, reload };
}
