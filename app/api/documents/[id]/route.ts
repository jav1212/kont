import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { getDocumentsActions } from '@/src/modules/documents/backend/infrastructure/documents-factory';

function extractId(url: string): string {
    const segments = new URL(url).pathname.split('/');
    return segments[segments.length - 1]; // /api/documents/[id]
}

export const DELETE = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const actions = getDocumentsActions(ownerId);

    const id = extractId(req.url);

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

export const PATCH = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const actions = getDocumentsActions(ownerId);

    const id   = extractId(req.url);
    const body = await req.json().catch(() => ({}));

    // Only mutation supported right now is folder reassignment.
    if (!Object.prototype.hasOwnProperty.call(body, 'folderId')) {
        return Response.json({ error: 'folderId es requerido' }, { status: 400 });
    }

    const folderId = body.folderId === null || body.folderId === undefined
        ? null
        : String(body.folderId);

    // Permission check: uploader or admin+
    const docResult = await actions.findDocumentById.execute({ id });
    if (docResult.isFailure) {
        return Response.json({ error: docResult.getError() }, { status: 404 });
    }
    const doc         = docResult.getValue();
    const isUploader  = doc.uploadedBy === userId;
    const isAdminPlus = !actingAs || actingAs.role === 'owner' || actingAs.role === 'admin';
    if (!isUploader && !isAdminPlus) {
        return Response.json({ error: 'Sin permiso para mover este documento' }, { status: 403 });
    }

    const result = await actions.moveDocument.execute({ id, folderId });
    return handleResult(result);
});
