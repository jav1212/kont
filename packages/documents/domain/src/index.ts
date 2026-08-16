import type { CompanyId } from "@kontave/companies-domain";
import type { OrganizationId, UserId } from "@kontave/organizations-domain";

declare const documentIdBrand: unique symbol;
declare const documentFolderIdBrand: unique symbol;
export type DocumentId = string & { readonly [documentIdBrand]: true };
export type DocumentFolderId = string & { readonly [documentFolderIdBrand]: true };

export interface StoredDocument {
  readonly id: DocumentId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId | null;
  readonly folderId: DocumentFolderId | null;
  readonly name: string;
  readonly file: { readonly storageKey: string; readonly contentType: string | null; readonly sizeBytes: number | null };
  readonly uploadedBy: UserId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DocumentFolder {
  readonly id: DocumentFolderId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId | null;
  readonly parentId: DocumentFolderId | null;
  readonly name: string;
  readonly createdBy: UserId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type DocumentsFailureCode =
  | "DOCUMENT_INVALID" | "DOCUMENT_NOT_FOUND" | "DOCUMENT_VERSION_CONFLICT"
  | "DOCUMENT_FOLDER_NOT_FOUND" | "DOCUMENT_FOLDER_VERSION_CONFLICT" | "DOCUMENT_FOLDER_NOT_EMPTY"
  | "DOCUMENT_OUTSIDE_ORGANIZATION" | "DOCUMENT_OUTSIDE_COMPANY" | "DOCUMENT_STORAGE_UNAVAILABLE"
  | "DOCUMENT_REPOSITORY_UNAVAILABLE";

export class DocumentsFailure extends Error {
  constructor(readonly code: DocumentsFailureCode, message: string, options?: ErrorOptions) {
    super(message, options); this.name = "DocumentsFailure";
  }
}

export function documentId(value: string): DocumentId { return identifier(value, "document") as DocumentId; }
export function documentFolderId(value: string): DocumentFolderId { return identifier(value, "folder") as DocumentFolderId; }
export function documentName(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255) throw invalid("El nombre del documento debe contener entre 1 y 255 caracteres.");
  return normalized;
}
export function validateStoredFile(input: { readonly storageKey: string; readonly contentType: string | null; readonly sizeBytes: number | null }) {
  const storageKey = input.storageKey.trim();
  if (!storageKey || storageKey.startsWith("/") || storageKey.includes("..")) throw invalid("La ubicación del archivo no es válida.");
  if (input.sizeBytes !== null && (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0 || input.sizeBytes > 52_428_800)) throw invalid("El archivo debe pesar hasta 50 MB.");
  return Object.freeze({ storageKey, contentType: input.contentType?.trim() || null, sizeBytes: input.sizeBytes });
}
function identifier(value: string, label: string): string { const normalized=value.trim();if(!normalized||normalized.length>128)throw invalid(`El identificador de ${label} no es válido.`);return normalized; }
function invalid(message:string){return new DocumentsFailure("DOCUMENT_INVALID",message);}
