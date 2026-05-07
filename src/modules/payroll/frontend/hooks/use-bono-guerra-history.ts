"use client";

import { useCallback, useEffect, useState } from "react";
import type { BonoGuerraRun }     from "@/src/modules/payroll/backend/domain/bono-guerra-run";
import type { BonoGuerraReceipt } from "@/src/modules/payroll/backend/domain/bono-guerra-receipt";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";
import { notify }    from "@/src/shared/frontend/notify";

export type { BonoGuerraRun, BonoGuerraReceipt };

// ============================================================================
// TYPES
// ============================================================================

export interface BonoGuerraReceiptPayload {
    companyId:       string;
    employeeId:      string;   // cedula = PK in employees
    employeeCedula:  string;
    employeeNombre:  string;
    employeeCargo:   string;
    montoUsd:        number;
    montoVes:        number;
}

export interface BonoGuerraPayload {
    run: {
        companyId:    string;
        periodStart:  string;
        periodEnd:    string;
        montoUsd:     number;
        exchangeRate: number;
    };
    receipts: BonoGuerraReceiptPayload[];
}

interface UseBonoGuerraHistoryResult {
    runs:        BonoGuerraRun[];
    loading:     boolean;
    reload:      () => Promise<void>;
    getReceipts: (runId: string) => Promise<BonoGuerraReceipt[] | null>;
    confirm:     (payload: BonoGuerraPayload) => Promise<boolean>;
    saveDraft:   (payload: BonoGuerraPayload) => Promise<{ runId: string | null }>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useBonoGuerraHistory(companyId: string | null): UseBonoGuerraHistoryResult {
    const [runs,    setRuns]    = useState<BonoGuerraRun[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);

        const { ok, json } = await fetchJson(`/api/payroll/bono-guerra/runs?companyId=${companyId}`);
        if (!ok) notify.error(json.error ?? "Error al cargar historial de bono socio económico");
        else     setRuns((json.data as BonoGuerraRun[]) ?? []);

        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets loading before first await (non-cascading in React 18)
        if (companyId) reload();
    }, [companyId, reload]);

    const getReceipts = useCallback(async (runId: string): Promise<BonoGuerraReceipt[] | null> => {
        const { ok, json } = await fetchJson(`/api/payroll/bono-guerra/receipts?runId=${runId}`);
        if (!ok) { notify.error(json.error ?? "Error al cargar recibos"); return null; }
        return (json.data as BonoGuerraReceipt[]) ?? [];
    }, []);

    const confirm = useCallback(async (payload: BonoGuerraPayload): Promise<boolean> => {
        const { ok, json } = await fetchJson("/api/payroll/bono-guerra/runs/confirm", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
        });
        if (!ok) { notify.error(json.error ?? "Error al confirmar bono socio económico"); return false; }
        await reload();
        return true;
    }, [reload]);

    const saveDraft = useCallback(async (payload: BonoGuerraPayload): Promise<{ runId: string | null }> => {
        const { ok, json } = await fetchJson("/api/payroll/bono-guerra/runs/draft", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
        });
        if (!ok) { notify.error(json.error ?? "Error al guardar borrador"); return { runId: null }; }
        await reload();
        const data = json.data as { runId?: string } | undefined;
        return { runId: data?.runId ?? null };
    }, [reload]);

    return {
        runs:    companyId ? runs    : [],
        loading: companyId ? loading : false,
        reload,
        getReceipts,
        confirm,
        saveDraft,
    };
}
