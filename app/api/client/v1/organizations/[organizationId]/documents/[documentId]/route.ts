import type { MoveDocumentDto } from "@kontave/client-contracts";
import { documentFolderId, documentId } from "@kontave/documents-domain";
import {
  executeDocumentRequest,
  documentsDelete,
  documentsUpdate,
} from "@/src/client-api/v1/documents/document-http";
import { toDocumentDto } from "@/src/client-api/v1/documents/document-mapper";
type C = { params: Promise<{ organizationId: string; documentId: string }> };
export async function PATCH(request: Request, c: C) {
  const p = await c.params,
    b = (await request.json()) as MoveDocumentDto;
  return executeDocumentRequest(
    request,
    p.organizationId,
    documentsUpdate,
    async (a, organization) =>
      toDocumentDto(
        await a.move.execute({
          organizationId: organization,
          documentId: documentId(p.documentId),
          folderId: b.folderId ? documentFolderId(b.folderId) : null,
          expectedVersion: b.expectedVersion,
        }),
      ),
  );
}
export async function DELETE(request: Request, c: C) {
  const p = await c.params,
    b = (await request.json()) as { expectedVersion: number };
  return executeDocumentRequest(
    request,
    p.organizationId,
    documentsDelete,
    async (a, organization) => {
      await a.deleteDocument.execute({
        organizationId: organization,
        documentId: documentId(p.documentId),
        expectedVersion: b.expectedVersion,
      });
      return { deleted: true };
    },
  );
}
