"use client";

// Data hook for the chart of accounts.
// Provides loading/error/data contract consistent with other module hooks.
import { useEffect, useState, useCallback } from 'react';
import type { Account }                      from '../../backend/domain/account';

export function useAccounts(companyId: string | null) {
    const [data,    setData]    = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/accounting/accounts?companyId=${companyId}`);
            const json = await res.json() as { data?: Account[]; error?: string };
            if (!res.ok) { setError(json.error ?? 'Error'); return; }
            setData(json.data ?? []);
        } catch {
            setError('Error al cargar cuentas');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, error, reload };
}
