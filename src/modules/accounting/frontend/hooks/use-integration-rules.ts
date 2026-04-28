"use client";

// Data hook for accounting integration rules.
import { useEffect, useState, useCallback } from 'react';
import type { IntegrationRule }             from '../../backend/domain/integration-rule';
import { apiFetch }                        from '@/src/shared/frontend/utils/api-fetch';
import { notify }                          from '@/src/shared/frontend/notify';

export function useIntegrationRules(companyId: string | null) {
    const [data,    setData]    = useState<IntegrationRule[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        setLoading(true);
        try {
            const res  = await apiFetch(`/api/accounting/integration-rules?companyId=${companyId}`);
            const json = await res.json() as { data?: IntegrationRule[]; error?: string };
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar reglas de integración'); return; }
            setData(json.data ?? []);
        } catch {
            notify.error('Error al cargar reglas de integración');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, reload };
}
