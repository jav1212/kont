export interface DocumentFolderDto {
  readonly id: string;
  readonly organizationId: string;
  readonly companyId: string | null;
  readonly parentId: string | null;
  readonly name: string;
  readonly createdBy: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface DocumentDto {
  readonly id: string;
  readonly organizationId: string;
  readonly companyId: string | null;
  readonly folderId: string | null;
  readonly name: string;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly uploadedBy: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface CreateDocumentFolderDto {
  readonly name: string;
  readonly companyId?: string | null;
  readonly parentId?: string | null;
}
export interface RenameDocumentFolderDto {
  readonly name: string;
  readonly expectedVersion: number;
}
export interface CreateDocumentUploadDto {
  readonly fileName: string;
}
export interface RegisterDocumentDto {
  readonly name: string;
  readonly storageKey: string;
  readonly companyId?: string | null;
  readonly folderId?: string | null;
  readonly contentType?: string | null;
  readonly sizeBytes?: number | null;
}
export interface MoveDocumentDto {
  readonly folderId: string | null;
  readonly expectedVersion: number;
}
