"use client";

import { useEffect, useState } from "react";

export interface CapacityData {
    companies: {
        used:      number;
        max:       number | null;
        remaining: number | null;
    };
    employeesPerCompany: {
        max:       number | null;
        byCompany: Record<string, number>;
    };
}

export function useCapacity() {
    const [capacity, setCapacity]   = useState<CapacityData | null>(null);
    const [loading, setLoading]     = useState(true);

    useEffect(() => {
        fetch("/api/billing/capacity")
            .then((r) => r.json())
            .then((r) => setCapacity(r.data ?? null))
            .finally(() => setLoading(false));
    }, []);

    function canAddCompany(): boolean {
        // While loading (capacity = null), assume allowed to avoid SSR/client hydration mismatch.
        // The server validates limits on every mutation regardless.
        if (!capacity) return true;
        if (capacity.companies.max === null) return true;
        return capacity.companies.remaining! > 0;
    }

    function canAddEmployee(companyId: string): boolean {
        // While loading (capacity = null), assume allowed to avoid SSR/client hydration mismatch.
        // The server validates limits on every mutation regardless.
        if (!capacity) return true;
        if (capacity.employeesPerCompany.max === null) return true;
        const used = capacity.employeesPerCompany.byCompany[companyId] ?? 0;
        return used < capacity.employeesPerCompany.max;
    }

    function employeesRemaining(companyId: string): number | null {
        if (!capacity || capacity.employeesPerCompany.max === null) return null;
        const used = capacity.employeesPerCompany.byCompany[companyId] ?? 0;
        return Math.max(0, capacity.employeesPerCompany.max - used);
    }

    return { capacity, loading, canAddCompany, canAddEmployee, employeesRemaining };
}
