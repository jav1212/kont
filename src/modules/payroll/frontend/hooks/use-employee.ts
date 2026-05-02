"use client";

import { useCallback, useEffect, useState } from "react";
import type { Employee, EmployeeEstado, EmployeeMoneda, SalaryHistoryEntry } from "@/src/modules/payroll/backend/domain/employee";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";

export type { Employee, EmployeeEstado, EmployeeMoneda, SalaryHistoryEntry };

interface UseEmployeeResult {
    employees:        Employee[];
    loading:          boolean;
    reload:           () => Promise<void>;
    upsert:           (employees: Omit<Employee, "id" | "companyId">[]) => Promise<boolean>;
    remove:           (ids: string[]) => Promise<boolean>;
    renameCedula:     (oldCedula: string, newCedula: string) => Promise<boolean>;
    getSalaryHistory: (companyId: string, cedula: string) => Promise<SalaryHistoryEntry[] | null>;
}

export function useEmployee(companyId: string | null): UseEmployeeResult {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading,   setLoading]   = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const { ok, json } = await fetchJson(`/api/employees/get-by-company?companyId=${companyId}`);
        if (!ok) notify.error(json.error ?? "Error al cargar empleados");
        else     setEmployees((json.data as Employee[]) ?? []);
        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets loading before first await (non-cascading in React 18)
        if (companyId) reload();
    }, [companyId, reload]);

    const upsert = useCallback(async (rows: Omit<Employee, "id" | "companyId">[]): Promise<boolean> => {
        if (!companyId) { notify.error("No hay empresa seleccionada"); return false; }
        const withCompany = rows.map((e) => ({ ...e, companyId }));
        const { ok, json } = await fetchJson("/api/employees/upsert", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ companyId, employees: withCompany }),
        });
        if (!ok) { notify.error(json.error ?? "Error al guardar empleados"); return false; }
        await reload();
        return true;
    }, [companyId, reload]);

    const remove = useCallback(async (ids: string[]): Promise<boolean> => {
        if (!companyId) { notify.error("No hay empresa seleccionada"); return false; }
        const { ok, json } = await fetchJson("/api/employees/delete", {
            method:  "DELETE",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ ids }),
        });
        if (!ok) { notify.error(json.error ?? "Error al eliminar empleados"); return false; }
        await reload();
        return true;
    }, [companyId, reload]);

    const renameCedula = useCallback(async (oldCedula: string, newCedula: string): Promise<boolean> => {
        if (!companyId) { notify.error("No hay empresa seleccionada"); return false; }
        const { ok, json } = await fetchJson("/api/employees/rename-cedula", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ companyId, oldCedula, newCedula }),
        });
        if (!ok) { notify.error(json.error ?? "Error al renombrar la cédula"); return false; }
        await reload();
        return true;
    }, [companyId, reload]);

    const getSalaryHistory = useCallback(async (
        cId: string, cedula: string
    ): Promise<SalaryHistoryEntry[] | null> => {
        const { ok, json } = await fetchJson(
            `/api/employees/salary-history?companyId=${cId}&cedula=${encodeURIComponent(cedula)}`
        );
        if (!ok) { notify.error(json.error ?? "Error al cargar historial"); return null; }
        return (json.data as SalaryHistoryEntry[]) ?? [];
    }, []);

    return {
        employees: companyId ? employees : [],
        loading: companyId ? loading : false,
        reload,
        upsert,
        remove,
        renameCedula,
        getSalaryHistory,
    };
}
