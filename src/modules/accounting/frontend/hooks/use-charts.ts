"use client";

// Data hook for accounting charts (plan de cuentas).
import { useEffect, useState, useCallback } from 'react';
import type { AccountChart }               from '../../backend/domain/account-chart';
import type { ImportAccountInput }         from '../../backend/domain/repository/chart.repository';

export function useCharts(companyId: string | null) {
    const [data,    setData]    = useState<AccountChart[]>([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!companyId) { setData([]); return; }
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch(`/api/accounting/charts?companyId=${companyId}`);
            const json = await res.json() as { data?: AccountChart[]; error?: string };
            if (!res.ok) { setError(json.error ?? 'Error'); return; }
            setData(json.data ?? []);
        } catch {
            setError('Error al cargar planes de cuentas');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { void reload(); }, [reload]);

    async function deleteChart(chartId: string): Promise<string | null> {
        const res  = await fetch(`/api/accounting/charts/${chartId}`, { method: 'DELETE' });
        const json = await res.json() as { error?: string };
        if (!res.ok) return json.error ?? 'No se pudo eliminar el plan';
        await reload();
        return null;
    }

    async function importChart(name: string, accounts: ImportAccountInput[]): Promise<string | null> {
        if (!companyId) return 'companyId requerido';
        const res  = await fetch('/api/accounting/charts/import', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ companyId, name, accounts }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok) return json.error ?? 'No se pudo importar el plan';
        await reload();
        return null;
    }

    return { data, loading, error, reload, deleteChart, importChart };
}
