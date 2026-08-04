/** Resolves shared-schema rollout flags without widening the rollout implicitly. */
const DEFAULT_PILOT_TENANT_ID = '624a5ef3-6e23-43ba-b3de-30686fa944e5';

function pilotTenantIds(): Set<string> {
    const configured = process.env.SHARED_SCHEMA_PILOT_TENANTS ?? DEFAULT_PILOT_TENANT_ID;
    return new Set(configured.split(',').map((value) => value.trim()).filter(Boolean));
}

export function isSharedSchemaPilotEnabled(capabilityFlag: string | undefined, tenantId: string): boolean {
    return capabilityFlag === 'true' && pilotTenantIds().has(tenantId);
}
