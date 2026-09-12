"use client";

import { useActiveTenantContext } from "../context/active-tenant-context";
import type { MemberRole } from "../../backend/domain/membership";

export interface TenantEntry {
    tenantId:        string;
    role:            MemberRole;
    tenantEmail:     string;
    tenantAvatarUrl: string | null;
    isOwn:           boolean;
    permissions:     string[];
}

export interface UseActiveTenantResult {
    allTenants:        TenantEntry[];
    activeTenantId:    string | null;
    activeTenantRole:  MemberRole | null;
    activePermissions: string[];
    can:               (permission: string) => boolean;
    isActingOnBehalf:  boolean;
    loading:           boolean;
    switchTenant:      (tenantId: string) => void;
    clearActiveTenant: () => void;
}

/** Compatibility hook for the committed workspace's legacy tenant projection.
 * @param _urlTenantId - Retained for callers; URL selection is centrally coordinated.
 * @returns Canonical permissions and tenant selection commands.
 * @throws Error when called outside WebApplicationProvider.
 */
export function useActiveTenant(_urlTenantId?: string | null): UseActiveTenantResult {
    return useActiveTenantContext();
}
