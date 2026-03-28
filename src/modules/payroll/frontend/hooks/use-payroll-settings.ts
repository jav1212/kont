// src/modules/payroll/frontend/hooks/use-payroll-settings.ts
//
// React hook — loads and persists company-scoped PayrollSettings.
// Reloads automatically when companyId changes.
// Falls back to defaultPayrollSettings() when no settings are stored or on error.
//
// Contract: { settings, loading, error, loadedAt, save, reload }
//
// loadedAt increments every time settings are successfully fetched or saved.
// The Payroll page uses loadedAt to detect a fresh load and re-apply settings,
// which correctly handles A→B→A company switching (REQ-008).

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';
import {
    PayrollSettings,
    defaultPayrollSettings,
    mergePayrollSettings,
} from '../../backend/domain/payroll-settings';

interface UsePayrollSettingsResult {
    settings:  PayrollSettings;
    loading:   boolean;
    error:     string | null;
    /** Increments each time settings are successfully loaded or saved. */
    loadedAt:  number;
    save:      (settings: PayrollSettings) => Promise<string | null>;
    reload:    () => void;
}

export function usePayrollSettings(companyId: string | null): UsePayrollSettingsResult {
    const [settings,  setSettings]  = useState<PayrollSettings>(defaultPayrollSettings);
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState<string | null>(null);
    const [tick,      setTick]      = useState(0);
    const [loadedAt,  setLoadedAt]  = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function fetchSettings() {
            if (!companyId) {
                setError(null);
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const res  = await apiFetch(`/api/payroll/settings?companyId=${encodeURIComponent(companyId)}`);
                // handleResult() wraps the payload as { data: T } or { error: string }
                const json = await res.json() as { data?: Partial<PayrollSettings>; error?: string };
                if (cancelled) return;
                if (json.error) {
                    setError(json.error);
                    setSettings(defaultPayrollSettings());
                } else {
                    setSettings(mergePayrollSettings(json.data ?? {}));
                    setLoadedAt((n) => n + 1);
                }
            } catch {
                if (!cancelled) {
                    setError('Error al cargar la configuración');
                    setSettings(defaultPayrollSettings());
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void fetchSettings();
        return () => { cancelled = true; };
    }, [companyId, tick]);

    const save = useCallback(async (newSettings: PayrollSettings): Promise<string | null> => {
        if (!companyId) return 'No hay empresa seleccionada';
        try {
            const res = await apiFetch('/api/payroll/settings', {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ companyId, settings: newSettings }),
            });
            const data = await res.json() as Record<string, unknown>;
            if (!res.ok) return String(data.error ?? 'Error al guardar');
            setSettings(newSettings);
            setLoadedAt((n) => n + 1);
            return null;
        } catch {
            return 'Error de conexión';
        }
    }, [companyId]);

    const reload = useCallback(() => setTick((t) => t + 1), []);

    return { settings, loading, error, loadedAt, save, reload };
}
