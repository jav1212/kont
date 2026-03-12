"use client";

// ============================================================================
// useEmployee — employee state + all actions
//
// Loads employees for a given companyId.
// Exposes upsert (bulk) mirroring the employee-factory use cases.
// ============================================================================

import { useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmployeeEstado = "activo" | "inactivo" | "vacacion";

export interface Employee {
    id?:            number;
    companyId:      string;
    cedula:         string;
    nombre:         string;
    cargo:          string;
    salarioMensual: number;
    estado:         EmployeeEstado;
}

interface UseEmployeeResult {
    employees:  Employee[];
    loading:    boolean;
    error:      string | null;
    reload:     () => Promise<void>;
    upsert:     (employees: Omit<Employee, "id" | "companyId">[]) => Promise<string | null>;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
    const res  = await fetch(path, options);
    const text = await res.text();
    let json: any = {};
    try {
        json = JSON.parse(text);
    } catch {
        json = { error: `Error del servidor (${res.status})` };
    }
    return { ok: res.ok, json };
}

// ============================================================================
// HOOK
// ============================================================================

export function useEmployee(companyId: string | null): UseEmployeeResult {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState<string | null>(null);

    // ── Load ──────────────────────────────────────────────────────────────

    const reload = useCallback(async () => {
        if (!companyId) return;

        setLoading(true);
        setError(null);

        const { ok, json } = await apiFetch(
            `/api/employees/get-by-company?companyId=${companyId}`
        );

        if (!ok) {
            setError(json.error ?? "Error al cargar empleados");
        } else {
            setEmployees(json.data ?? []);
        }

        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        if (companyId) reload();
        else setEmployees([]);
    }, [companyId, reload]);

    // ── Upsert (bulk) ─────────────────────────────────────────────────────

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

    // ── Return ────────────────────────────────────────────────────────────

    return {
        employees,
        loading,
        error,
        reload,
        upsert,
    };
}