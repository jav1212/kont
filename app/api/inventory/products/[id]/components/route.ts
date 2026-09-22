import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { withTenantPermission } from '@/src/shared/backend/utils/require-tenant';

const productId = (request: Request): string => {
    const rawId = new URL(request.url).pathname.split('/').at(-2) ?? '';
    try {
        return decodeURIComponent(rawId);
    } catch {
        return '';
    }
};

export const GET = withTenantPermission('inventory.read', async (request, { tenantId }) => {
    const companyId = new URL(request.url).searchParams.get('companyId') ?? '';
    return handleResult(await getInventoryActions(tenantId).getProductComposition.execute({ companyId, productId: productId(request) }), 200, request);
});

export const PUT = withTenantPermission('inventory.update', async (request, { tenantId }) => {
    let body: { companyId?: string; components?: Array<{ productId: string; quantity: number }> };
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || !Array.isArray(body.components)) {
        return Response.json({ error: 'components must be an array' }, { status: 400 });
    }
    return handleResult(await getInventoryActions(tenantId).replaceProductComposition.execute({
        companyId: body.companyId ?? new URL(request.url).searchParams.get('companyId') ?? '', productId: productId(request), components: body.components,
    }), 200, request);
});
