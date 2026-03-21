"use client";

import { useCallback, useEffect, useState } from "react";
import type { Employee, EmployeeEstado, EmployeeMoneda, SalaryHistoryEntry } from "@/src/modules/payroll/backend/domain/employee";
import { apiFetch as tenantFetch } from "@/src/shared/frontend/utils/api-fetch";

export type { Employee, EmployeeEstado, EmployeeMoneda, SalaryHistoryEntry };

interface UseEmployeeResult {
    employees:        Employee[];
    loading:          boolean;
    error:            string | null;
    reload:           () => Promise<void>;
    upsert:           (employees: Omit<Employee, "id" | "companyId">[]) => Promise<string | null>;
    remove:           (ids: string[]) => Promise<string | null>;
    getSalaryHistory: (companyId: string, cedula: string) => Promise<{ history: SalaryHistoryEntry[]; error: string | null }>;
}

async function apiFetch(path: string, options?: RequestInit) {
    const res  = await tenantFetch(path, options);
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { json = { error: `Error del servidor (${res.status})` }; }
    return { ok: res.ok, json };
}

export function useEmployee(companyId: string | null): UseEmployeeResult {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setError(null);
        const { ok, json } = await apiFetch(`/api/employees/get-by-company?companyId=${companyId}`);
        if (!ok) setError(json.error ?? "Error al cargar empleados");
        else     setEmployees(json.data ?? []);
        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        if (companyId) reload();
        else setEmployees([]);
    }, [companyId, reload]);

    const upsert = useCallback(async (rows: Omit<Employee, "id" | "companyId">[]): Promise<string | null> => {
        if (!companyId) return "No hay empresa seleccionada";
        const withCompany = rows.map((e) => ({ ...e, companyId }));
        const { ok, json } = await apiFetch("/api/employees/upsert", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ companyId, employees: withCompany }),
        });
        if (!ok) return json.error ?? "Error al guardar empleados";
        await reload();
        return null;
    }, [companyId, reload]);

    const remove = useCallback(async (ids: string[]): Promise<string | null> => {
        if (!companyId) return "No hay empresa seleccionada";
        const { ok, json } = await apiFetch("/api/employees/delete", {
            method:  "DELETE",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ ids }),
        });
        if (!ok) return json.error ?? "Error al eliminar empleados";
        await reload();
        return null;
    }, [companyId, reload]);

    const getSalaryHistory = useCallback(async (
        cId: string, cedula: string
    ): Promise<{ history: SalaryHistoryEntry[]; error: string | null }> => {
        const { ok, json } = await apiFetch(
            `/api/employees/salary-history?companyId=${cId}&cedula=${encodeURIComponent(cedula)}`
        );
        if (!ok) return { history: [], error: json.error ?? "Error al cargar historial" };
        return { history: json.data ?? [], error: null };
    }, []);

    return { employees, loading, error, reload, upsert, remove, getSalaryHistory };
}
