"use client";

// Data hook for accounting integration rules.
import { useEffect, useState, useCallback } from 'react';
import type { IntegrationRule }             from '../../backend/domain/integration-rule';
import { apiFetch }                        from '@/src/shared/frontend/utils/api-fetch';

export function useIntegrationRules(companyId: string | null) {
    const [data,    setData]    = useState<IntegrationRule[]>([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        setLoading(true);
        setError(null);
        try {
            const res  = await apiFetch(`/api/accounting/integration-rules?companyId=${companyId}`);
            const json = await res.json() as { data?: IntegrationRule[]; error?: string };
            if (!res.ok) { setError(json.error ?? 'Error'); return; }
            setData(json.data ?? []);
        } catch {
            setError('Error al cargar reglas de integración');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, error, reload };
}
