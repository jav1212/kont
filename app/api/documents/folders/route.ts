import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { getDocumentsActions } from '@/src/modules/documents/backend/infrastructure/documents-factory';

export const GET = withTenant(async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    const ownerId  = effectiveOwnerId;
    const { getFolders } = getDocumentsActions(tenantId);

    const url       = new URL(req.url);
    const parentId  = url.searchParams.get('parentId') || null;
    const companyId = url.searchParams.get('companyId') || null;

    const result = await getFolders.execute({ parentId, companyId });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    const ownerId = effectiveOwnerId;
    const { createFolder } = getDocumentsActions(tenantId);

    const body = await req.json();
    const result = await createFolder.execute({
        name:      body.name,
        parentId:  body.parentId ?? null,
        companyId: body.companyId ?? null,
        createdBy: userId,
    });
    return handleResult(result, 201);
});
