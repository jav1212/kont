"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import type { Company, TaxpayerType } from "@/src/modules/companies/backend/domain/company";
import { validateRif } from "../utils/rif";

export interface CompanyLite {
    id: string;
    name: string;
    rif?: string;
    taxpayerType: TaxpayerType;
    disabled: boolean;
    disabledReason?: string;
}

interface State {
    companies: CompanyLite[];
    loading: boolean;
    error: string | null;
}

// Module-level cache to deduplicate concurrent fetches
let _cacheKey: string | null = null;
let _cachePromise: Promise<Company[]> | null = null;

async function fetchCompanies(userId: string): Promise<Company[]> {
    const cacheKey = userId;
    if (_cacheKey === cacheKey && _cachePromise) {
        return _cachePromise;
    }
    _cacheKey = cacheKey;
    _cachePromise = fetch(`/api/companies/get-by-owner?ownerId=${encodeURIComponent(userId)}`, {
        credentials: "include",
    })
        .then((res) => {
            if (!res.ok) throw new Error("Failed to fetch companies");
            return res.json();
        })
        .then((json) => {
            const data = json.data ?? [];
            return data as Company[];
        })
        .catch((err) => {
            _cachePromise = null;
            throw err;
        });

    return _cachePromise;
}

export function useCompaniesLite(): State {
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();

    const [companies, setCompanies] = useState<CompanyLite[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading) return;

        if (!isAuthenticated || !user) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- non-cascading reset; deferring it (e.g. via setTimeout) creates a microtask/macrotask race with cached fetch resolution that pins the loading skeleton permanently
            setCompanies([]);
            setLoading(false);
            setError(null);
            return;
        }

        // Must be set synchronously: a deferred setLoading(true) (e.g. via
        // setTimeout(0)) loses the microtask/macrotask race against cached-fetch
        // .then resolution and pins the loading skeleton permanently.
        setLoading(true);
        setError(null);

        let cancelled = false;

        fetchCompanies(user.id)
            .then((raw) => {
                if (cancelled) return;
                const lite: CompanyLite[] = raw.map((c) => {
                    // Legacy companies store the RIF as the id instead of in the rif column
                    const effectiveRif = c.rif ?? (validateRif(c.id) ? c.id : undefined);
                    return {
                        id: c.id,
                        name: c.name,
                        rif: effectiveRif,
                        taxpayerType: c.taxpayerType ?? "ordinario",
                        disabled: !effectiveRif,
                        disabledReason: !effectiveRif ? "Agrega un RIF en Configuración" : undefined,
                    };
                });
                setCompanies(lite);
                setLoading(false);
                setError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                setCompanies([]);
                setLoading(false);
                setError(err instanceof Error ? err.message : "Error al cargar empresas");
            });

        return () => { cancelled = true; };
    }, [isAuthenticated, authLoading, user]);

    return { companies, loading, error };
}
