import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { getDocumentsActions } from '@/src/modules/documents/backend/infrastructure/documents-factory';

export const POST = withTenant(async (req, { userId, actingAs, effectiveOwnerId, tenantId}) => {
    const ownerId = effectiveOwnerId;
    const { getUploadUrl } = getDocumentsActions(tenantId);

    const body = await req.json();
    const result = await getUploadUrl.execute({
        ownerId,
        fileName: body.fileName,
    });
    return handleResult(result);
});
