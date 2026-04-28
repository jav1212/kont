"use client";

import { useCallback, useEffect, useState } from "react";
import type { PayrollRun }     from "@/src/modules/payroll/backend/domain/payroll-run";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";
import type { PayrollReceipt } from "@/src/modules/payroll/backend/domain/payroll-receipt";

export type { PayrollRun, PayrollReceipt };

// ============================================================================
// TYPES
// ============================================================================

export interface ConfirmReceiptPayload {
    companyId:       string;
    employeeId:      string;   // cedula = PK in employees
    employeeCedula:  string;
    employeeNombre:  string;
    employeeCargo:   string;
    monthlySalary:   number;
    totalEarnings:   number;
    totalDeductions: number;
    totalBonuses:    number;
    netPay:          number;
    calculationData: {
        gross:          number;
        netUsd:         number;
        mondaysInMonth: number;
        diasUtilidades?: number;
        diasBonoVacacional?: number;
        alicuotaUtil?: number;
        alicuotaBono?: number;
        salarioIntegral?: number;
    };
}

export interface ConfirmPayload {
    run: {
        companyId:    string;
        periodStart:  string;
        periodEnd:    string;
        exchangeRate: number;
    };
    receipts: ConfirmReceiptPayload[];
}

export interface SaveDraftResult {
    runId: string | null;
    error: string | null;
}

interface UsePayrollHistoryResult {
    runs:        PayrollRun[];
    loading:     boolean;
    error:       string | null;
    reload:      () => Promise<void>;
    getReceipts: (runId: string) => Promise<{ receipts: PayrollReceipt[]; error: string | null }>;
    confirm:     (payload: ConfirmPayload) => Promise<string | null>;
    saveDraft:   (payload: ConfirmPayload) => Promise<SaveDraftResult>;
}

// ============================================================================
// HOOK
// ============================================================================

export function usePayrollHistory(companyId: string | null): UsePayrollHistoryResult {
    const [runs,    setRuns]    = useState<PayrollRun[]>([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setError(null);

        const { ok, json } = await fetchJson(`/api/payroll/runs?companyId=${companyId}`);
        if (!ok) setError(json.error ?? "Error al cargar historial");
        else     setRuns((json.data as PayrollRun[]) ?? []);

        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets loading/error before first await (non-cascading in React 18)
        if (companyId) reload();
    }, [companyId, reload]);

    const getReceipts = useCallback(async (runId: string) => {
        const { ok, json } = await fetchJson(`/api/payroll/receipts?runId=${runId}`);
        if (!ok) return { receipts: [], error: json.error ?? "Error al cargar recibos" };
        return { receipts: (json.data as PayrollReceipt[]) ?? [], error: null };
    }, []);

    const confirm = useCallback(async (payload: ConfirmPayload): Promise<string | null> => {
        const { ok, json } = await fetchJson("/api/payroll/runs/confirm", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
        });
        if (!ok) return json.error ?? "Error al confirmar nómina";
        await reload();
        return null;
    }, [reload]);

    const saveDraft = useCallback(async (payload: ConfirmPayload): Promise<SaveDraftResult> => {
        const { ok, json } = await fetchJson("/api/payroll/runs/draft", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
        });
        if (!ok) return { runId: null, error: json.error ?? "Error al guardar borrador" };
        await reload();
        const data = json.data as { runId?: string } | undefined;
        return { runId: data?.runId ?? null, error: null };
    }, [reload]);

    return {
        runs: companyId ? runs : [],
        loading: companyId ? loading : false,
        error: companyId ? error : null,
        reload,
        getReceipts,
        confirm,
        saveDraft,
    };
}
