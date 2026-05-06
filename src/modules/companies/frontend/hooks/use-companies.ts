"use client";

// ============================================================================
// Company context + hook
//
// A single CompanyProvider (company-provider.tsx) at the app layout level
// owns all state. Every call to useCompany() reads from the same shared
// instance — so a delete in <CompaniesPage> is immediately reflected in
// <AppSidebar>.
// ============================================================================

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { apiFetch as tenantApiFetch, fetchJson as tenantFetchJson, type ApiJsonResult } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";

// Mirrors the key used by useActiveTenant — read here only as an optimistic
// hint to avoid the auth → memberships → companies waterfall on cold start.
const ACTIVE_TENANT_STORAGE_KEY = "kont-active-tenant-id";

// ── Types ─────────────────────────────────────────────────────────────────────

// Sector type and custom field definition — mirrors backend domain types.
export type BusinessSector =
    | 'farmacia' | 'supermercado' | 'panaderia' | 'repuestos'
    | 'ferreteria' | 'restaurante' | 'tienda_ropa' | 'licoreria' | 'otro';

// Re-export taxpayer classification from domain — mirrors SENIAT categories.
export type TaxpayerType = 'ordinario' | 'especial';

export const TAXPAYER_TYPES: readonly TaxpayerType[] = ['ordinario', 'especial'] as const;

export const TAXPAYER_TYPE_LABELS: Record<TaxpayerType, string> = {
    ordinario: 'Contribuyente Ordinario',
    especial:  'Sujeto Pasivo Especial',
};

export interface CustomFieldDefinition {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select';
    options?: string[];
    required?: boolean;
}

export interface InventoryConfig {
    customFields: CustomFieldDefinition[];
    visibleColumns?: string[];
    defaultMeasureUnit?: string;
    defaultValuationMethod?: string;
}

export interface Company {
    id:              string;
    ownerId:         string;
    name:            string;
    rif?:            string;
    phone?:          string;
    address?:        string;
    contactEmail?:   string;
    logoUrl?:        string;
    showLogoInPdf?:  boolean;
    sector?:         BusinessSector;
    taxpayerType?:   TaxpayerType;
    inventoryConfig?:InventoryConfig;
    createdAt?:      string;
    updatedAt?:      string;
}

export interface CompanyUpdateData {
    name?:           string;
    rif?:            string;
    phone?:          string;
    address?:        string;
    contactEmail?:   string;
    logoUrl?:        string;
    showLogoInPdf?:  boolean;
    sector?:         BusinessSector;
    taxpayerType?:   TaxpayerType;
}

export interface UseCompanyResult {
    companies:          Company[];
    company:            Company | null;
    companyId:          string | null;
    loading:            boolean;
    reload:             () => Promise<void>;
    selectCompany:      (id: string) => void;
    save:               (data: { id: string; name: string; rif?: string; taxpayerType?: TaxpayerType }) => Promise<string | null>;
    update:             (id: string, data: CompanyUpdateData)              => Promise<string | null>;
    remove:             (id: string)                                       => Promise<string | null>;
    applySector:        (companyId: string, sector: BusinessSector)        => Promise<string | null>;
    getInventoryConfig: (companyId: string) => Promise<InventoryConfig | null>;
    saveInventoryConfig:(companyId: string, config: InventoryConfig) => Promise<string | null>;
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

// urlCompanyId — when present, takes priority over localStorage for resolution.
// Enables URL-based context sharing (e.g. ?cid=xxx).
export function useCompanyState(activeTenantId?: string | null, urlCompanyId?: string | null): UseCompanyResult {
    const { user, isAuthenticated } = useAuth();

    const [companies,         setCompanies]         = useState<Company[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        return localStorage.getItem(STORAGE_KEY) ?? null;
    });
    const [loading, setLoading] = useState(true);

    // Tracks the last ownerId we issued a fetch for. Used to suppress the
    // duplicate fetch that would otherwise fire when the optimistic hint
    // matches the verified activeTenantId (the common case).
    const lastFetchedOwnerId = useRef<string | null>(null);

    const fetchFor = useCallback(async (ownerId: string) => {
        setLoading(true);
        const res  = await tenantApiFetch(`/api/companies/get-by-owner?ownerId=${ownerId}`);
        const text = await res.text();
        const json: ApiJsonResult = parseJsonSafe(text, `Error del servidor (${res.status})`);
        const ok = res.ok;

        if (!ok) {
            // Stale localStorage hint can produce a 403 here; that's expected
            // and self-heals on the next reload (when activeTenantId is verified).
            // Surface other errors normally.
            if (res.status !== 403) {
                notify.error(json.error ?? "Error al cargar empresas");
            }
        } else {
            const list: Company[] = (json.data as Company[]) ?? [];
            setCompanies(list);
            setSelectedCompanyId((prev) => {
                // Resolution: URL param > current state > localStorage > first company
                const fromUrl = urlCompanyId && list.some((c) => c.id === urlCompanyId)
                    ? urlCompanyId : null;
                const fromPrev = prev && list.some((c) => c.id === prev) ? prev : null;
                const next = fromUrl ?? fromPrev ?? (list[0]?.id ?? null);
                if (next) localStorage.setItem(STORAGE_KEY, next);
                else      localStorage.removeItem(STORAGE_KEY);
                return next;
            });
        }

        setLoading(false);
    }, [urlCompanyId]);

    const reload = useCallback(async () => {
        if (!user?.id) return;

        // Use the verified active tenant when available; otherwise fall back to
        // a synchronous read of the localStorage hint set by useActiveTenant.
        // This eliminates the waterfall: companies start loading in parallel
        // with /api/memberships instead of strictly after it. If the hint is
        // stale, the API responds 403 and the next effect run (when
        // activeTenantId has been verified) issues the correct fetch.
        let ownerId = activeTenantId;
        if (!ownerId && typeof window !== "undefined") {
            ownerId = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
        }
        if (!ownerId) {
            setCompanies([]);
            setLoading(false);
            lastFetchedOwnerId.current = null;
            return;
        }

        lastFetchedOwnerId.current = ownerId;
        await fetchFor(ownerId);
    }, [user, activeTenantId, fetchFor]);

    useEffect(() => {
        if (!isAuthenticated || !user?.id) {
            if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
        }
    }, [isAuthenticated, user?.id]);

    // Reset helper kept outside the effect body so the lint rule doesn't fire
    // on direct setState calls inside the effect.
    const clearCompanyState = useCallback(() => {
        setCompanies([]);
        setLoading(false);
        lastFetchedOwnerId.current = null;
    }, []);

    useEffect(() => {
        if (!isAuthenticated || !user?.id) return;

        // Resolve effective owner: verified > optimistic hint.
        let ownerId = activeTenantId;
        if (!ownerId && typeof window !== "undefined") {
            ownerId = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
        }
        if (!ownerId) {
            clearCompanyState();
            return;
        }

        // Skip when the verified id matches the hint we already fetched with —
        // the data is already correct and a duplicate request would be wasted.
        if (lastFetchedOwnerId.current === ownerId) return;
        lastFetchedOwnerId.current = ownerId;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchFor sets loading before first await (non-cascading in React 18)
        fetchFor(ownerId);
    }, [isAuthenticated, user?.id, activeTenantId, fetchFor, clearCompanyState]);

    const save = useCallback(async (data: { id: string; name: string; rif?: string; taxpayerType?: TaxpayerType }): Promise<string | null> => {
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

    const applySector = useCallback(async (companyId: string, sector: BusinessSector): Promise<string | null> => {
        const { ok, json } = await tenantFetchJson("/api/companies/apply-sector", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ companyId, sector }),
        });
        if (!ok) return json.error ?? "Error al aplicar sector";
        await reload();
        return null;
    }, [reload]);

    const getInventoryConfig = useCallback(async (companyId: string): Promise<InventoryConfig | null> => {
        const res  = await tenantApiFetch(`/api/companies/inventory-config?companyId=${companyId}`);
        const text = await res.text();
        const json = parseJsonSafe(text, "Error al obtener configuración de inventario");
        if (!res.ok) return null;
        return (json.data as InventoryConfig) ?? null;
    }, []);

    const saveInventoryConfig = useCallback(async (companyId: string, config: InventoryConfig): Promise<string | null> => {
        const { ok, json } = await tenantFetchJson("/api/companies/inventory-config", {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ companyId, config }),
        });
        if (!ok) return json.error ?? "Error al guardar configuración";
        await reload();
        return null;
    }, [reload]);

    const hasSession = isAuthenticated && !!user?.id;
    const visibleCompanies = hasSession ? companies : [];
    const visibleCompanyId = hasSession ? selectedCompanyId : null;
    const selectedCompany = visibleCompanies.find((c) => c.id === visibleCompanyId) ?? null;

    return {
        companies: visibleCompanies,
        company: selectedCompany,
        companyId: visibleCompanyId,
        loading: hasSession ? loading : false,
        reload,
        selectCompany,
        save,
        update,
        remove,
        applySector,
        getInventoryConfig,
        saveInventoryConfig,
    };
}

// ── Public hook — reads from the shared context ───────────────────────────────

export function useCompany(): UseCompanyResult {
    const ctx = useContext(CompanyContext);
    if (!ctx) throw new Error("useCompany must be used inside <CompanyProvider>");
    return ctx;
}
