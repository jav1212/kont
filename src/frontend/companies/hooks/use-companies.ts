"use client";

// ============================================================================
// useCompany — company state + all CRUD actions
//
// Auto-loads the authenticated user's companies on mount.
// Exposes save, update, delete mirroring the company-factory use cases.
//
// For the payroll calculator: companyId = companies[0]?.id
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../auth/hooks/use-auth";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Company {
    id:        string;
    ownerId:   string;
    name:      string;
    createdAt?: string;
    updatedAt?: string;
}

interface UseCompanyResult {
    companies:         Company[];
    company:           Company | null;   // selected company
    companyId:         string | null;
    loading:           boolean;
    error:             string | null;
    reload:            () => Promise<void>;
    selectCompany:     (id: string) => void;
    save:              (data: { id: string; name: string }) => Promise<string | null>;
    update:            (id: string, name: string)           => Promise<string | null>;
    remove:            (id: string)                         => Promise<string | null>;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
    const res  = await fetch(path, options);
    const text = await res.text();
    let json: any = {};
    try {
        json = JSON.parse(text);
    } catch {
        // Server returned non-JSON (HTML error page, 404, etc.)
        json = { error: `Error del servidor (${res.status})` };
    }
    return { ok: res.ok, json };
}

// ============================================================================
// HOOK
// ============================================================================

export function useCompany(): UseCompanyResult {
    const { user, isAuthenticated } = useAuth();

    const [companies,          setCompanies]          = useState<Company[]>([]);
    const [selectedCompanyId,  setSelectedCompanyId]  = useState<string | null>(null);
    const [loading,            setLoading]            = useState(true);
    const [error,              setError]              = useState<string | null>(null);

    // ── Load ──────────────────────────────────────────────────────────────

    const reload = useCallback(async () => {
        if (!user?.id) return;

        setLoading(true);
        setError(null);

        const { ok, json } = await apiFetch(`/api/companies/get-by-owner?ownerId=${user.id}`);

        if (!ok) {
            setError(json.error ?? "Error al cargar empresas");
        } else {
            const list: Company[] = json.data ?? [];
            setCompanies(list);
            // Auto-select first company if none selected yet
            setSelectedCompanyId((prev) => prev ?? list[0]?.id ?? null);
        }

        setLoading(false);
    }, [user?.id]);

    useEffect(() => {
        if (isAuthenticated && user?.id) {
            reload();
        } else {
            setLoading(false);
        }
    }, [isAuthenticated, user?.id, reload]);

    // ── Save ──────────────────────────────────────────────────────────────

    const save = useCallback(async (data: { id: string; name: string }): Promise<string | null> => {
        if (!user?.id) return "No autenticado";

        const { ok, json } = await apiFetch("/api/companies/save", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ ...data, ownerId: user.id }),
        });

        if (!ok) return json.error ?? "Error al guardar";
        await reload();
        return null;
    }, [user?.id, reload]);

    // ── Update ────────────────────────────────────────────────────────────

    const update = useCallback(async (id: string, name: string): Promise<string | null> => {
        const { ok, json } = await apiFetch("/api/companies/update", {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ id, name }),
        });

        if (!ok) return json.error ?? "Error al actualizar";
        await reload();
        return null;
    }, [reload]);

    // ── Delete ────────────────────────────────────────────────────────────

    const remove = useCallback(async (id: string): Promise<string | null> => {
        const { ok, json } = await apiFetch(`/api/companies/delete?id=${id}`);

        if (!ok) return json.error ?? "Error al eliminar";
        await reload();
        return null;
    }, [reload]);

    const selectCompany = useCallback((id: string) => {
        setSelectedCompanyId(id);
    }, []);

    // ── Return ────────────────────────────────────────────────────────────

    const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null;

    return {
        companies,
        company:       selectedCompany,
        companyId:     selectedCompanyId,
        loading,
        error,
        reload,
        selectCompany,
        save,
        update,
        remove,
    };
}