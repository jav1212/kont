import type { DocumentDto, DocumentFolderDto } from "@kontave/client-contracts";
import type { DocumentFolder, StoredDocument } from "@kontave/documents-domain";
export const toDocumentDto = (value: StoredDocument): DocumentDto => ({
  id: value.id,
  organizationId: value.organizationId,
  companyId: value.companyId,
  folderId: value.folderId,
  name: value.name,
  contentType: value.file.contentType,
  sizeBytes: value.file.sizeBytes,
  uploadedBy: value.uploadedBy,
  version: value.version,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
});
export const toDocumentFolderDto = (
  value: DocumentFolder,
): DocumentFolderDto => ({ ...value });
