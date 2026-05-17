"use client";

import { useCallback, useEffect, useState } from "react";
import type { BonificacionesRun }     from "@/src/modules/payroll/backend/domain/bonificaciones-run";
import type {
    BonificacionesReceipt,
    BonificacionesBonusLineSnapshot,
} from "@/src/modules/payroll/backend/domain/bonificaciones-receipt";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";
import { notify }    from "@/src/shared/frontend/notify";

export type { BonificacionesRun, BonificacionesReceipt, BonificacionesBonusLineSnapshot };

// ============================================================================
// TYPES
// ============================================================================

export interface BonificacionesReceiptPayload {
    companyId:       string;
    employeeId:      string;
    employeeCedula:  string;
    employeeNombre:  string;
    employeeCargo:   string;
    totalVes:        number;
    bonusLines:      BonificacionesBonusLineSnapshot[];
}

export interface BonificacionesPayload {
    run: {
        companyId:     string;
        periodStart:   string;
        periodEnd:     string;
        exchangeRate:  number;
        totalVes:      number;
        employeeCount: number;
        lineCount:     number;
    };
    receipts: BonificacionesReceiptPayload[];
}

interface UseBonificacionesHistoryResult {
    runs:        BonificacionesRun[];
    loading:     boolean;
    reload:      () => Promise<void>;
    getReceipts: (runId: string) => Promise<BonificacionesReceipt[] | null>;
    confirm:     (payload: BonificacionesPayload) => Promise<boolean>;
    saveDraft:   (payload: BonificacionesPayload) => Promise<{ runId: string | null }>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useBonificacionesHistory(companyId: string | null): UseBonificacionesHistoryResult {
    const [runs,    setRuns]    = useState<BonificacionesRun[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);

        const { ok, json } = await fetchJson(`/api/payroll/bonificaciones/runs?companyId=${companyId}`);
        if (!ok) notify.error(json.error ?? "Error al cargar historial de bonificaciones");
        else     setRuns((json.data as BonificacionesRun[]) ?? []);

        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets loading before first await (non-cascading in React 18)
        if (companyId) reload();
    }, [companyId, reload]);

    const getReceipts = useCallback(async (runId: string): Promise<BonificacionesReceipt[] | null> => {
        const { ok, json } = await fetchJson(`/api/payroll/bonificaciones/receipts?runId=${runId}`);
        if (!ok) { notify.error(json.error ?? "Error al cargar recibos"); return null; }
        return (json.data as BonificacionesReceipt[]) ?? [];
    }, []);

    const confirm = useCallback(async (payload: BonificacionesPayload): Promise<boolean> => {
        const { ok, json } = await fetchJson("/api/payroll/bonificaciones/runs/confirm", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
        });
        if (!ok) { notify.error(json.error ?? "Error al confirmar bonificaciones"); return false; }
        await reload();
        return true;
    }, [reload]);

    const saveDraft = useCallback(async (payload: BonificacionesPayload): Promise<{ runId: string | null }> => {
        const { ok, json } = await fetchJson("/api/payroll/bonificaciones/runs/draft", {
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
