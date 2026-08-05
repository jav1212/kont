/** Resolves shared-schema rollout flags without widening the rollout implicitly. */
function pilotTenantIds(): Set<string> {
    // Fail closed: a missing allowlist must never activate shared-schema data.
    const configured = process.env.SHARED_SCHEMA_PILOT_TENANTS ?? '';
    return new Set(configured.split(',').map((value) => value.trim()).filter(Boolean));
}

export function isSharedSchemaPilotEnabled(capabilityFlag: string | undefined, tenantId: string): boolean {
    return capabilityFlag === 'true' && pilotTenantIds().has(tenantId);
}
