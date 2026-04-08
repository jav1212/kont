"use client";

import { useCallback, useEffect, useState } from "react";
import type { Employee, EmployeeEstado, EmployeeMoneda, SalaryHistoryEntry } from "@/src/modules/payroll/backend/domain/employee";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";

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

export function useEmployee(companyId: string | null): UseEmployeeResult {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setError(null);
        const { ok, json } = await fetchJson(`/api/employees/get-by-company?companyId=${companyId}`);
        if (!ok) setError(json.error ?? "Error al cargar empleados");
        else     setEmployees((json.data as Employee[]) ?? []);
        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets loading/error before first await (non-cascading in React 18)
        if (companyId) reload();
    }, [companyId, reload]);

    const upsert = useCallback(async (rows: Omit<Employee, "id" | "companyId">[]): Promise<string | null> => {
        if (!companyId) return "No hay empresa seleccionada";
        const withCompany = rows.map((e) => ({ ...e, companyId }));
        const { ok, json } = await fetchJson("/api/employees/upsert", {
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
        const { ok, json } = await fetchJson("/api/employees/delete", {
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
        const { ok, json } = await fetchJson(
            `/api/employees/salary-history?companyId=${cId}&cedula=${encodeURIComponent(cedula)}`
        );
        if (!ok) return { history: [], error: json.error ?? "Error al cargar historial" };
        return { history: (json.data as SalaryHistoryEntry[]) ?? [], error: null };
    }, []);

    return {
        employees: companyId ? employees : [],
        loading: companyId ? loading : false,
        error: companyId ? error : null,
        reload,
        upsert,
        remove,
        getSalaryHistory,
    };
}
