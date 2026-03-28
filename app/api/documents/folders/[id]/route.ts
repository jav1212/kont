import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { getDocumentsActions } from '@/src/modules/documents/backend/infrastructure/documents-factory';

export const DELETE = withTenant(async (_req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const { deleteFolder } = getDocumentsActions(ownerId);

    // Next.js passes params via the second argument when using route segments,
    // but withTenant only passes TenantContext. We extract the id from the URL.
    const url = new URL(_req.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 2]; // /api/documents/folders/[id]

    const result = await deleteFolder.execute({ id });
    return handleResult(result);
});
