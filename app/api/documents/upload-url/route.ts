import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { getDocumentsActions } from '@/src/modules/documents/backend/infra/documents-factory';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const { getUploadUrl } = getDocumentsActions(ownerId);

    const body = await req.json();
    const result = await getUploadUrl.execute({
        ownerId,
        fileName: body.fileName,
    });
    return handleResult(result);
});
