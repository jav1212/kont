"use client";

import { useCallback, useEffect, useState } from "react";
import type { PayrollRun }     from "@/src/modules/payroll/backend/domain/payroll-run";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";
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
        earningLines?:   { label: string; formula: string; amount: number }[];
        bonusLines?:     { label: string; formula: string; amount: number }[];
        deductionLines?: { label: string; formula: string; amount: number }[];
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

interface UsePayrollHistoryResult {
    runs:        PayrollRun[];
    loading:     boolean;
    reload:      () => Promise<void>;
    getReceipts: (runId: string) => Promise<PayrollReceipt[] | null>;
    confirm:     (payload: ConfirmPayload) => Promise<boolean>;
    saveDraft:   (payload: ConfirmPayload) => Promise<{ runId: string | null }>;
}

// ============================================================================
// HOOK
// ============================================================================

export function usePayrollHistory(companyId: string | null): UsePayrollHistoryResult {
    const [runs,    setRuns]    = useState<PayrollRun[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);

        const { ok, json } = await fetchJson(`/api/payroll/runs?companyId=${companyId}`);
        if (!ok) notify.error(json.error ?? "Error al cargar historial");
        else     setRuns((json.data as PayrollRun[]) ?? []);

        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets loading before first await (non-cascading in React 18)
        if (companyId) reload();
    }, [companyId, reload]);

    const getReceipts = useCallback(async (runId: string): Promise<PayrollReceipt[] | null> => {
        const { ok, json } = await fetchJson(`/api/payroll/receipts?runId=${runId}`);
        if (!ok) { notify.error(json.error ?? "Error al cargar recibos"); return null; }
        return (json.data as PayrollReceipt[]) ?? [];
    }, []);

    const confirm = useCallback(async (payload: ConfirmPayload): Promise<boolean> => {
        const { ok, json } = await fetchJson("/api/payroll/runs/confirm", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
        });
        if (!ok) { notify.error(json.error ?? "Error al confirmar nómina"); return false; }
        await reload();
        return true;
    }, [reload]);

    const saveDraft = useCallback(async (payload: ConfirmPayload): Promise<{ runId: string | null }> => {
        const { ok, json } = await fetchJson("/api/payroll/runs/draft", {
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
        runs: companyId ? runs : [],
        loading: companyId ? loading : false,
        reload,
        getReceipts,
        confirm,
        saveDraft,
    };
}
