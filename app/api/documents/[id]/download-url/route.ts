import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { getDocumentsActions } from '@/src/modules/documents/backend/infra/documents-factory';

export const GET = withTenant(async (_req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const { getDownloadUrl } = getDocumentsActions(ownerId);

    const url      = new URL(_req.url);
    const segments = url.pathname.split('/');
    // /api/documents/[id]/download-url  →  id es segments[segments.length - 2]
    const id = segments[segments.length - 2];

    const result = await getDownloadUrl.execute({ id });
    return handleResult(result);
});
