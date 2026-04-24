"use client";

import { useEffect, useRef, useState } from "react";
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

    // Track whether the current effect is still relevant
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        // Wait for auth to settle
        if (authLoading) return;

        if (!isAuthenticated || !user) {
            // Schedule the state update asynchronously to avoid the synchronous-setState-in-effect warning
            const timer = setTimeout(() => {
                if (isMounted.current) {
                    setCompanies([]);
                    setLoading(false);
                    setError(null);
                }
            }, 0);
            return () => clearTimeout(timer);
        }

        // Authenticated — fetch companies
        const timer = setTimeout(() => {
            if (!isMounted.current) return;
            setLoading(true);
            setError(null);
        }, 0);

        fetchCompanies(user.id)
            .then((raw) => {
                if (!isMounted.current) return;
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
                if (!isMounted.current) return;
                setCompanies([]);
                setLoading(false);
                setError(err instanceof Error ? err.message : "Error al cargar empresas");
            });

        return () => clearTimeout(timer);
    }, [isAuthenticated, authLoading, user]);

    return { companies, loading, error };
}
