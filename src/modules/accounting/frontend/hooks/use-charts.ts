"use client";

// Data hook for accounting charts (plan de cuentas).
import { useEffect, useState, useCallback } from 'react';
import type { AccountChart }               from '../../backend/domain/account-chart';
import type { ImportAccountInput }         from '../../backend/domain/repository/chart.repository';
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

    async function createChart(name: string): Promise<boolean> {
        if (!companyId) { notify.error('companyId requerido'); return false; }
        const res  = await apiFetch('/api/accounting/charts', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ companyId, name }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok) { notify.error(json.error ?? 'No se pudo crear el plan'); return false; }
        await reload();
        return true;
    }

    async function renameChart(chartId: string, companyId: string, name: string): Promise<boolean> {
        const res  = await apiFetch(`/api/accounting/charts/${chartId}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ companyId, name }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok) { notify.error(json.error ?? 'No se pudo renombrar el plan'); return false; }
        await reload();
        return true;
    }

    async function deleteChart(chartId: string): Promise<boolean> {
        const res  = await apiFetch(`/api/accounting/charts/${chartId}`, { method: 'DELETE' });
        const json = await res.json() as { error?: string };
        if (!res.ok) { notify.error(json.error ?? 'No se pudo eliminar el plan'); return false; }
        await reload();
        return true;
    }

    async function importChart(name: string, accounts: ImportAccountInput[]): Promise<boolean> {
        if (!companyId) { notify.error('companyId requerido'); return false; }
        const res  = await apiFetch('/api/accounting/charts/import', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ companyId, name, accounts }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok) { notify.error(json.error ?? 'No se pudo importar el plan'); return false; }
        await reload();
        return true;
    }

    return { data, loading, reload, createChart, renameChart, deleteChart, importChart };
}
