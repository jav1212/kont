import type { RenameDocumentFolderDto } from "@kontave/client-contracts";
import { documentFolderId } from "@kontave/documents/domain";
import {
  executeDocumentRequest,
  documentsDelete,
  documentsUpdate,
} from "@/src/client-api/v1/documents/document-http";
import { toDocumentFolderDto } from "@/src/client-api/v1/documents/document-mapper";
type C = { params: Promise<{ organizationId: string; folderId: string }> };
export async function PATCH(request: Request, c: C) {
  const p = await c.params,
    b = (await request.json()) as RenameDocumentFolderDto;
  return executeDocumentRequest(
    request,
    p.organizationId,
    documentsUpdate,
    async (a, organization) =>
      toDocumentFolderDto(
        await a.renameFolder.execute({
          organizationId: organization,
          folderId: documentFolderId(p.folderId),
          name: b.name,
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
      await a.deleteFolder.execute({
        organizationId: organization,
        folderId: documentFolderId(p.folderId),
        expectedVersion: b.expectedVersion,
      });
      return { deleted: true };
    },
  );
}
