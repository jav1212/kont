import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { getDocumentsActions } from '@/src/modules/documents/backend/infrastructure/documents-factory';

// Extracts the folder id from /api/documents/folders/[id].
// filter(Boolean) handles both trailing-slash and non-trailing-slash URLs.
function extractId(req: Request): string {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '';
}

export const PATCH = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const { updateFolder } = getDocumentsActions(ownerId);
    const id   = extractId(req);
    const body = await req.json();
    const result = await updateFolder.execute({ id, name: body.name });
    return handleResult(result);
});

export const DELETE = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const { deleteFolder } = getDocumentsActions(ownerId);
    const id = extractId(req);
    const result = await deleteFolder.execute({ id });
    return handleResult(result);
});
