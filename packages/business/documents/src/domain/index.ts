import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

declare const documentIdBrand: unique symbol;
declare const documentFolderIdBrand: unique symbol;

/** Stable identifier for a stored document. */
export type DocumentId = string & { readonly [documentIdBrand]: true };

/** Stable identifier for a document folder. */
export type DocumentFolderId = string & { readonly [documentFolderIdBrand]: true };

/** Metadata for an organization-owned stored document. */
export interface StoredDocument {
  readonly id: DocumentId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId | null;
  readonly folderId: DocumentFolderId | null;
  readonly name: string;
  readonly file: {
    readonly storageKey: string;
    readonly contentType: string | null;
    readonly sizeBytes: number | null;
  };
  readonly uploadedBy: UserId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Organization-owned folder used to classify stored documents. */
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

/** Stable expected-failure codes exposed by the documents capability. */
export type DocumentsFailureCode =
  | "DOCUMENT_INVALID"
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_VERSION_CONFLICT"
  | "DOCUMENT_FOLDER_NOT_FOUND"
  | "DOCUMENT_FOLDER_VERSION_CONFLICT"
  | "DOCUMENT_FOLDER_NOT_EMPTY"
  | "DOCUMENT_OUTSIDE_ORGANIZATION"
  | "DOCUMENT_OUTSIDE_COMPANY"
  | "DOCUMENT_STORAGE_UNAVAILABLE"
  | "DOCUMENT_REPOSITORY_UNAVAILABLE";

/** Expected failure raised by document domain and boundary operations. */
export class DocumentsFailure extends Error {
  /**
   * Creates a portable documents failure.
   *
   * @param code - Stable machine-readable failure code.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying cause.
   */
  constructor(readonly code: DocumentsFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DocumentsFailure";
  }
}

/**
 * Validates and brands a document identifier.
 *
 * @param value - Untrusted identifier value.
 * @returns The normalized document identifier.
 * @throws {DocumentsFailure} When the identifier is empty or too long.
 */
export function documentId(value: string): DocumentId {
  return identifier(value, "documento") as DocumentId;
}

/**
 * Validates and brands a folder identifier.
 *
 * @param value - Untrusted identifier value.
 * @returns The normalized folder identifier.
 * @throws {DocumentsFailure} When the identifier is empty or too long.
 */
export function documentFolderId(value: string): DocumentFolderId {
  return identifier(value, "carpeta") as DocumentFolderId;
}

/**
 * Normalizes a user-visible document or folder name.
 *
 * @param value - Untrusted name.
 * @returns A trimmed name.
 * @throws {DocumentsFailure} When the name is empty or exceeds 255 characters.
 */
export function documentName(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255) {
    throw invalid("El nombre del documento debe contener entre 1 y 255 caracteres.");
  }
  return normalized;
}

/** Description of an object already written to document storage. */
export interface StoredFileInput {
  readonly storageKey: string;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
}

/**
 * Validates metadata for an object already written to storage.
 *
 * @param input - Untrusted storage metadata.
 * @returns Frozen, normalized storage metadata.
 * @throws {DocumentsFailure} When the key is unsafe or the size exceeds 50 MB.
 */
export function validateStoredFile(input: StoredFileInput): Readonly<StoredFileInput> {
  const storageKey = input.storageKey.trim();
  if (!storageKey || storageKey.startsWith("/") || storageKey.includes("..")) {
    throw invalid("La ubicación del archivo no es válida.");
  }
  if (
    input.sizeBytes !== null
    && (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0 || input.sizeBytes > 52_428_800)
  ) {
    throw invalid("El archivo debe pesar hasta 50 MB.");
  }
  return Object.freeze({
    storageKey,
    contentType: input.contentType?.trim() || null,
    sizeBytes: input.sizeBytes,
  });
}

function identifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw invalid(`El identificador de ${label} no es válido.`);
  }
  return normalized;
}

function invalid(message: string): DocumentsFailure {
  return new DocumentsFailure("DOCUMENT_INVALID", message);
}
