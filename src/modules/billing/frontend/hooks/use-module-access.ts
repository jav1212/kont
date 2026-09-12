"use client";

import { useEffect, useState } from "react";
import { useWebApplication } from "@/src/modules/workspace/frontend/web-application-provider";

const planCache = new Map<string, string | null>();
const planPromiseCache = new Map<string, Promise<string | null>>();

/** @param slug - Product slug associated with the module. @returns Subscription access and workspace readiness. */
export function useModuleAccess(slug: string): { readonly hasAccess: boolean; readonly status: string | null; readonly loading: boolean } {
    const { snapshot } = useWebApplication();
    const subscription = snapshot.subscriptions.find((entry) => entry.product?.slug === slug) ?? null;
    return { hasAccess: snapshot.status === "ready" && (subscription?.status === "active" || subscription?.status === "trial"), status: snapshot.status === "ready" ? subscription?.status ?? null : null, loading: snapshot.status === "loading" || snapshot.status === "stopped" };
}

/** Invalidates legacy plan-name values after a billing mutation. @returns Nothing. */
export function invalidateModuleAccessCache(): void {
    planCache.clear();
    planPromiseCache.clear();
}

/** @returns The selected tenant plan name, or null while unavailable. */
export function usePlanName(): string | null {
    const { snapshot } = useWebApplication();
    const [plan, setPlan] = useState<{ readonly tenantId: string; readonly name: string | null } | null>(null);
    const tenantId = snapshot.tenantId;
    useEffect(() => {
        let active = true;
        if (snapshot.status !== "ready" || !tenantId) return () => { active = false; };
        void fetchPlanName(tenantId).then((name) => { if (active) setPlan({ tenantId, name }); });
        return () => { active = false; };
    }, [snapshot.status, tenantId]);
    return plan && plan.tenantId === tenantId && snapshot.status === "ready" ? plan.name : null;
}

/** @param tenantId - Active legacy tenant scope. @returns Its plan name, or null when unavailable. */
async function fetchPlanName(tenantId: string): Promise<string | null> {
    if (planCache.has(tenantId)) return planCache.get(tenantId) ?? null;
    const pending = planPromiseCache.get(tenantId);
    if (pending) return pending;
    const request = fetch("/api/billing/tenant", { headers: { "X-Tenant-Id": tenantId } })
        .then(async (response) => {
            const payload = await response.json().catch(() => null) as { data?: { plan?: { name?: unknown } } } | null;
            const name = response.ok && typeof payload?.data?.plan?.name === "string" ? payload.data.plan.name : null;
            planCache.set(tenantId, name);
            return name;
        })
        .catch(() => null)
        .finally(() => { planPromiseCache.delete(tenantId); });
    planPromiseCache.set(tenantId, request);
    return request;
}
