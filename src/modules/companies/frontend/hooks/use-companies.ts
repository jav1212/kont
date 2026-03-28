"use client";

// ============================================================================
// Company context + hook
//
// A single CompanyProvider (company-provider.tsx) at the app layout level
// owns all state. Every call to useCompany() reads from the same shared
// instance — so a delete in <CompaniesPage> is immediately reflected in
// <AppSidebar>.
// ============================================================================

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { apiFetch as tenantApiFetch, type ApiJsonResult } from "@/src/shared/frontend/utils/api-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Company {
    id:              string;
    ownerId:         string;
    name:            string;
    rif?:            string;
    phone?:          string;
    address?:        string;
    logoUrl?:        string;
    showLogoInPdf?:  boolean;
    createdAt?:      string;
    updatedAt?:      string;
}

export interface CompanyUpdateData {
    name?:           string;
    rif?:            string;
    phone?:          string;
    address?:        string;
    logoUrl?:        string;
    showLogoInPdf?:  boolean;
}

export interface UseCompanyResult {
    companies:     Company[];
    company:       Company | null;
    companyId:     string | null;
    loading:       boolean;
    error:         string | null;
    reload:        () => Promise<void>;
    selectCompany: (id: string) => void;
    save:          (data: { id: string; name: string; rif?: string }) => Promise<string | null>;
    update:        (id: string, data: CompanyUpdateData)              => Promise<string | null>;
    remove:        (id: string)                                       => Promise<string | null>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJsonSafe(text: string, fallbackError: string): ApiJsonResult {
    try { return JSON.parse(text) as ApiJsonResult; }
    catch { return { error: fallbackError }; }
}

// Uses raw fetch (not tenant-aware) — company CRUD routes rely on auth session only.
async function apiFetch(path: string, options?: RequestInit): Promise<{ ok: boolean; json: ApiJsonResult }> {
    const res  = await fetch(path, options);
    const text = await res.text();
    const json = parseJsonSafe(text, `Error del servidor (${res.status})`);
    return { ok: res.ok, json };
}

const STORAGE_KEY = "kont-company-id";

// ── Context ───────────────────────────────────────────────────────────────────

export const CompanyContext = createContext<UseCompanyResult | null>(null);

// ── Internal hook — used only by CompanyProvider ──────────────────────────────

export function useCompanyState(activeTenantId?: string | null): UseCompanyResult {
    const { user, isAuthenticated } = useAuth();

    const [companies,         setCompanies]         = useState<Company[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        return localStorage.getItem(STORAGE_KEY) ?? null;
    });
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        setError(null);

        // When acting on behalf, fetch companies of the active tenant owner
        const ownerId = activeTenantId ?? user.id;
        const res  = await tenantApiFetch(`/api/companies/get-by-owner?ownerId=${ownerId}`);
        const text = await res.text();
        const json: ApiJsonResult = parseJsonSafe(text, `Error del servidor (${res.status})`);
        const ok = res.ok;

        if (!ok) {
            setError(json.error ?? "Error al cargar empresas");
        } else {
            const list: Company[] = (json.data as Company[]) ?? [];
            setCompanies(list);
            setSelectedCompanyId((prev) => {
                const valid = list.find((c) => c.id === prev);
                const next  = valid ? prev : (list[0]?.id ?? null);
                if (next) localStorage.setItem(STORAGE_KEY, next);
                else      localStorage.removeItem(STORAGE_KEY);
                return next;
            });
        }

        setLoading(false);
    }, [user, activeTenantId]);

    // Clear companies on render when user signs out (render-phase update avoids
    // multiple synchronous setState calls inside an effect body).
    const [lastAuthKey, setLastAuthKey] = useState(`${isAuthenticated}|${user?.id ?? ""}`);
    const currentAuthKey = `${isAuthenticated}|${user?.id ?? ""}`;
    if (lastAuthKey !== currentAuthKey) {
        setLastAuthKey(currentAuthKey);
        if (!isAuthenticated || !user?.id) {
            if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
            setCompanies([]);
            setSelectedCompanyId(null);
            setLoading(false);
        }
    }

    useEffect(() => {
        if (isAuthenticated && user?.id) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets loading/error before first await (non-cascading in React 18)
            reload();
        }
    }, [isAuthenticated, user?.id, activeTenantId, reload]);

    const save = useCallback(async (data: { id: string; name: string; rif?: string }): Promise<string | null> => {
        if (!user?.id) return "No autenticado";
        const { ok, json } = await apiFetch("/api/companies/save", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ ...data, ownerId: user.id }),
        });
        if (!ok) return json.error ?? "Error al guardar";
        await reload();
        return null;
    }, [user, reload]);

    const update = useCallback(async (id: string, data: CompanyUpdateData): Promise<string | null> => {
        const { ok, json } = await apiFetch("/api/companies/update", {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ id, ...data }),
        });
        if (!ok) return json.error ?? "Error al actualizar";
        await reload();
        return null;
    }, [reload]);

    const remove = useCallback(async (id: string): Promise<string | null> => {
        const { ok, json } = await apiFetch(`/api/companies/delete?id=${id}`, { method: "DELETE" });
        if (!ok) return json.error ?? "Error al eliminar";
        await reload();
        return null;
    }, [reload]);

    const selectCompany = useCallback((id: string) => {
        setSelectedCompanyId(id);
        localStorage.setItem(STORAGE_KEY, id);
    }, []);

    const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null;

    return {
        companies, company: selectedCompany, companyId: selectedCompanyId,
        loading, error, reload, selectCompany, save, update, remove,
    };
}

// ── Public hook — reads from the shared context ───────────────────────────────

export function useCompany(): UseCompanyResult {
    const ctx = useContext(CompanyContext);
    if (!ctx) throw new Error("useCompany must be used inside <CompanyProvider>");
    return ctx;
}
