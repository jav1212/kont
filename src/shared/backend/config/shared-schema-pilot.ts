/**
 * Single shared-schema rollout selector.
 *
 * During the pilot, set SHARED_SCHEMA_PILOT_TENANTS to the tenant UUID(s),
 * for example: 624a5ef3-6e23-43ba-b3de-30686fa944e5.
 * Set it to `*` once every tenant should use shared schema.
 */
export function isSharedSchemaEnabled(tenantId: string): boolean {
    const configured = process.env.SHARED_SCHEMA_PILOT_TENANTS ?? '';
    const tenants = configured.split(',').map((value) => value.trim()).filter(Boolean);
    return tenants.includes('*') || tenants.includes(tenantId);
}
