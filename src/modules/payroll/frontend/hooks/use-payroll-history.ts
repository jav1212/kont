"use client";

import { useCallback, useEffect, useState } from "react";
import type { PayrollRun }     from "@/src/modules/payroll/backend/domain/payroll-run";
import { apiFetch as tenantFetch } from "@/src/shared/frontend/utils/api-fetch";
import type { PayrollReceipt } from "@/src/modules/payroll/backend/domain/payroll-receipt";

export type { PayrollRun, PayrollReceipt };

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
    const res  = await tenantFetch(path, options);
    const text = await res.text();
    let json: any = {};
    try   { json = JSON.parse(text); }
    catch { json = { error: `Error del servidor (${res.status})` }; }
    return { ok: res.ok, json };
}

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
    error:       string | null;
    reload:      () => Promise<void>;
    getReceipts: (runId: string) => Promise<{ receipts: PayrollReceipt[]; error: string | null }>;
    confirm:     (payload: ConfirmPayload) => Promise<string | null>;
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

        const { ok, json } = await apiFetch(`/api/payroll/runs?companyId=${companyId}`);
        if (!ok) setError(json.error ?? "Error al cargar historial");
        else     setRuns(json.data ?? []);

        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        if (companyId) reload();
        else           setRuns([]);
    }, [companyId, reload]);

    const getReceipts = useCallback(async (runId: string) => {
        const { ok, json } = await apiFetch(`/api/payroll/receipts?runId=${runId}`);
        if (!ok) return { receipts: [], error: json.error ?? "Error al cargar recibos" };
        return { receipts: json.data ?? [], error: null };
    }, []);

    const confirm = useCallback(async (payload: ConfirmPayload): Promise<string | null> => {
        const { ok, json } = await apiFetch("/api/payroll/runs/confirm", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
        });
        if (!ok) return json.error ?? "Error al confirmar nómina";
        await reload();
        return null;
    }, [reload]);

    return { runs, loading, error, reload, getReceipts, confirm };
}
