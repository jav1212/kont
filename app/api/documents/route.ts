import { withTenant } from '@/src/shared/backend/utils/require-tenant';
import { handleResult } from '@/src/shared/backend/utils/handle-result';
import { getDocumentsActions } from '@/src/modules/documents/backend/infra/documents-factory';

export const GET = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const { getDocuments } = getDocumentsActions(ownerId);

    const url       = new URL(req.url);
    const folderId  = url.searchParams.get('folderId') || null;
    const companyId = url.searchParams.get('companyId') || null;

    const result = await getDocuments.execute({ folderId, companyId });
    return handleResult(result);
});

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const { registerDocument } = getDocumentsActions(ownerId);

    const body = await req.json();
    const result = await registerDocument.execute({
        name:        body.name,
        storagePath: body.storagePath,
        uploadedBy:  userId,
        folderId:    body.folderId ?? null,
        companyId:   body.companyId ?? null,
        mimeType:    body.mimeType ?? null,
        sizeBytes:   body.sizeBytes ?? null,
    });
    return handleResult(result, 201);
});
