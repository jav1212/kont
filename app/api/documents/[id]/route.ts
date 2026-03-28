import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { getDocumentsActions } from '@/src/modules/documents/backend/infrastructure/documents-factory';

export const DELETE = withTenant(async (_req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const actions = getDocumentsActions(ownerId);

    const url      = new URL(_req.url);
    const segments = url.pathname.split('/');
    const id       = segments[segments.length - 1]; // /api/documents/[id]

    // Fetch doc to check uploader permissions
    const docResult = await actions.findDocumentById.execute({ id });
    if (docResult.isFailure) {
        return Response.json({ error: docResult.getError() }, { status: 404 });
    }

    const doc         = docResult.getValue();
    const isUploader  = doc.uploadedBy === userId;
    const isAdminPlus = !actingAs || actingAs.role === 'owner' || actingAs.role === 'admin';

    if (!isUploader && !isAdminPlus) {
        return Response.json({ error: 'Sin permiso para eliminar este documento' }, { status: 403 });
    }

    const result = await actions.deleteDocument.execute({ id });
    return handleResult(result);
});
