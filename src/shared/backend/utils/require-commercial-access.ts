import { ServerSupabaseSource } from '../source/infra/server-supabase';

/**
 * Verifies the Web commercial subscription independently of role permissions.
 * Purchases and sales use the existing Inventory subscription bundle. Company
 * presentation profiles never participate in this authorization decision.
 *
 * @param tenantId - Tenant already resolved through the authorized organization.
 * @param permission - Canonical permission requested by the API operation.
 * @returns Whether the required product has an active or trial subscription;
 * unmetered organization capabilities do not require a product subscription.
 * @throws Error when the subscription source cannot be verified; callers deny access.
 */
export async function hasWebCommercialAccess(tenantId: string, permission: string): Promise<boolean> {
    const capability = permission.split('.')[0];
    const product = ({
        inventory: 'inventory', purchases: 'inventory', sales: 'inventory',
        payroll: 'payroll', employees: 'payroll', accounting: 'accounting',
    } as Record<string, string | undefined>)[capability];
    if (!product) return true;

    const { data, error } = await new ServerSupabaseSource().instance
        .from('tenant_subscriptions')
        .select('status, products!inner(slug)')
        .eq('tenant_id', tenantId)
        .eq('products.slug', product)
        .in('status', ['active', 'trial']);
    if (error) throw new Error('No se pudo verificar la suscripción.');
    return (data ?? []).some((row) => {
        const entry = Array.isArray(row.products) ? row.products[0] : row.products;
        return entry?.slug === product && ['active', 'trial'].includes(row.status);
    });
}
