"use client";

import { useCallback, useEffect, useState } from "react";
import type { CestaTicketRun }     from "@/src/modules/payroll/backend/domain/cesta-ticket-run";
import type { CestaTicketReceipt } from "@/src/modules/payroll/backend/domain/cesta-ticket-receipt";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";
import { notify }    from "@/src/shared/frontend/notify";

export type { CestaTicketRun, CestaTicketReceipt };

// ============================================================================
// TYPES
// ============================================================================

export interface CestaTicketReceiptPayload {
    companyId:       string;
    employeeId:      string;   // cedula = PK in employees
    employeeCedula:  string;
    employeeNombre:  string;
    employeeCargo:   string;
    montoUsd:        number;
    montoVes:        number;
}

export interface CestaTicketPayload {
    run: {
        companyId:    string;
        periodStart:  string;
        periodEnd:    string;
        montoUsd:     number;
        exchangeRate: number;
    };
    receipts: CestaTicketReceiptPayload[];
}

interface UseCestaTicketHistoryResult {
    runs:        CestaTicketRun[];
    loading:     boolean;
    reload:      () => Promise<void>;
    getReceipts: (runId: string) => Promise<CestaTicketReceipt[] | null>;
    confirm:     (payload: CestaTicketPayload) => Promise<boolean>;
    saveDraft:   (payload: CestaTicketPayload) => Promise<{ runId: string | null }>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCestaTicketHistory(companyId: string | null): UseCestaTicketHistoryResult {
    const [runs,    setRuns]    = useState<CestaTicketRun[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);

        const { ok, json } = await fetchJson(`/api/payroll/cesta-ticket/runs?companyId=${companyId}`);
        if (!ok) notify.error(json.error ?? "Error al cargar historial de cesta ticket");
        else     setRuns((json.data as CestaTicketRun[]) ?? []);

        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets loading before first await (non-cascading in React 18)
        if (companyId) reload();
    }, [companyId, reload]);

    const getReceipts = useCallback(async (runId: string): Promise<CestaTicketReceipt[] | null> => {
        const { ok, json } = await fetchJson(`/api/payroll/cesta-ticket/receipts?runId=${runId}`);
        if (!ok) { notify.error(json.error ?? "Error al cargar recibos"); return null; }
        return (json.data as CestaTicketReceipt[]) ?? [];
    }, []);

    const confirm = useCallback(async (payload: CestaTicketPayload): Promise<boolean> => {
        const { ok, json } = await fetchJson("/api/payroll/cesta-ticket/runs/confirm", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
        });
        if (!ok) { notify.error(json.error ?? "Error al confirmar cesta ticket"); return false; }
        await reload();
        return true;
    }, [reload]);

    const saveDraft = useCallback(async (payload: CestaTicketPayload): Promise<{ runId: string | null }> => {
        const { ok, json } = await fetchJson("/api/payroll/cesta-ticket/runs/draft", {
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
