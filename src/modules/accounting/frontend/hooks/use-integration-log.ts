"use client";

// Data hook for the accounting integration log.
import { useEffect, useState, useCallback } from 'react';
import type { IntegrationLogEntry }          from '../../backend/domain/integration-log';
import { apiFetch }                          from '@/src/shared/frontend/utils/api-fetch';
import { notify }                            from '@/src/shared/frontend/notify';

export function useIntegrationLog(companyId: string | null, limit = 50) {
    const [data,    setData]    = useState<IntegrationLogEntry[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        setLoading(true);
        try {
            const res  = await apiFetch(`/api/accounting/integration-log?companyId=${companyId}&limit=${limit}`);
            const json = await res.json() as { data?: IntegrationLogEntry[]; error?: string };
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar registro de integraciones'); return; }
            setData(json.data ?? []);
        } catch {
            notify.error('Error al cargar registro de integraciones');
        } finally {
            setLoading(false);
        }
    }, [companyId, limit]);

    useEffect(() => { void reload(); }, [reload]);

    return { data, loading, reload };
}
