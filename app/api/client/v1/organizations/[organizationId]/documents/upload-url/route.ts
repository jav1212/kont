import type { CreateDocumentUploadDto } from "@kontave/client-contracts";
import {
  executeDocumentRequest,
  documentsCreate,
} from "@/src/client-api/v1/documents/document-http";
type C = { params: Promise<{ organizationId: string }> };
export async function POST(request: Request, c: C) {
  const { organizationId } = await c.params,
    b = (await request.json()) as CreateDocumentUploadDto;
  return executeDocumentRequest(
    request,
    organizationId,
    documentsCreate,
    (a, organization) =>
      a.createUpload.execute({
        organizationId: organization,
        fileName: b.fileName,
      }),
  );
}
