import type { CompanyId } from "@kontave/companies/domain";
import {
  DocumentsFailure,
  documentName,
  validateStoredFile,
  type DocumentFolder,
  type DocumentFolderId,
  type DocumentId,
  type StoredDocument,
} from "@kontave/documents-domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** Persistence port owned by the documents application layer. */
export interface DocumentsRepository {
  /** @returns Documents matching the organization, company and folder filters. */
  listDocuments(input: {
    organizationId: OrganizationId;
    companyId?: CompanyId | null;
    folderId?: DocumentFolderId | null;
  }): Promise<readonly StoredDocument[]>;
  /** @returns Folders matching the organization and optional company filter. */
  listFolders(input: {
    organizationId: OrganizationId;
    companyId?: CompanyId | null;
  }): Promise<readonly DocumentFolder[]>;
  /** @returns The authoritative folder created by persistence. */
  createFolder(input: {
    organizationId: OrganizationId;
    companyId: CompanyId | null;
    parentId: DocumentFolderId | null;
    name: string;
    createdBy: UserId;
  }): Promise<DocumentFolder>;
  /** @returns The renamed authoritative folder. */
  renameFolder(input: {
    organizationId: OrganizationId;
    folderId: DocumentFolderId;
    name: string;
    expectedVersion: number;
  }): Promise<DocumentFolder>;
  /** @returns A promise completed after the folder metadata is deleted. */
  deleteFolder(input: {
    organizationId: OrganizationId;
    folderId: DocumentFolderId;
    expectedVersion: number;
  }): Promise<void>;
  /** @returns The authoritative document metadata created by persistence. */
  registerDocument(input: {
    organizationId: OrganizationId;
    companyId: CompanyId | null;
    folderId: DocumentFolderId | null;
    name: string;
    file: { storageKey: string; contentType: string | null; sizeBytes: number | null };
    uploadedBy: UserId;
  }): Promise<StoredDocument>;
  /** @returns The moved authoritative document metadata. */
  moveDocument(input: {
    organizationId: OrganizationId;
    documentId: DocumentId;
    folderId: DocumentFolderId | null;
    expectedVersion: number;
  }): Promise<StoredDocument>;
  /** @returns The matching document, or `null` when it does not exist in the organization. */
  findDocument(organizationId: OrganizationId, id: DocumentId): Promise<StoredDocument | null>;
  /** @returns A promise completed after the document metadata is deleted. */
  deleteDocument(input: {
    organizationId: OrganizationId;
    documentId: DocumentId;
    expectedVersion: number;
  }): Promise<void>;
}

/** Object-storage port owned by the documents application layer. */
export interface DocumentStorage {
  /** @returns A short-lived upload URL and its durable storage key. */
  createUpload(input: {
    organizationId: OrganizationId;
    fileName: string;
  }): Promise<{ uploadUrl: string; storageKey: string }>;
  /** @returns A short-lived download URL for the storage key. */
  createDownload(storageKey: string): Promise<string>;
  /** @returns A promise completed after the stored object is removed. */
  delete(storageKey: string): Promise<void>;
}

/** Lists documents visible within an organization scope. */
export class ListDocuments {
  /** @param repo - Documents persistence port. */
  constructor(private readonly repo: DocumentsRepository) {}

  /**
   * @param input - Organization and optional classification filters.
   * @returns Matching documents.
   * @throws {DocumentsFailure} When persistence is unavailable.
   */
  execute(input: Parameters<DocumentsRepository["listDocuments"]>[0]): Promise<readonly StoredDocument[]> {
    return repositoryCall(() => this.repo.listDocuments(input));
  }
}

/** Lists folders visible within an organization scope. */
export class ListDocumentFolders {
  /** @param repo - Documents persistence port. */
  constructor(private readonly repo: DocumentsRepository) {}

  /**
   * @param input - Organization and optional company filter.
   * @returns Matching folders.
   * @throws {DocumentsFailure} When persistence is unavailable.
   */
  execute(input: Parameters<DocumentsRepository["listFolders"]>[0]): Promise<readonly DocumentFolder[]> {
    return repositoryCall(() => this.repo.listFolders(input));
  }
}

/** Creates a validated document folder. */
export class CreateDocumentFolder {
  /** @param repo - Documents persistence port. */
  constructor(private readonly repo: DocumentsRepository) {}

  /**
   * @param input - Folder ownership, hierarchy and name.
   * @returns The created folder.
   * @throws {DocumentsFailure} When validation or persistence fails.
   */
  execute(input: Parameters<DocumentsRepository["createFolder"]>[0]): Promise<DocumentFolder> {
    const normalized = { ...input, name: documentName(input.name) };
    return repositoryCall(() => this.repo.createFolder(normalized));
  }
}

/** Renames a folder using optimistic concurrency. */
export class RenameDocumentFolder {
  /** @param repo - Documents persistence port. */
  constructor(private readonly repo: DocumentsRepository) {}

  /**
   * @param input - Folder identity, new name and expected version.
   * @returns The renamed folder.
   * @throws {DocumentsFailure} When validation, persistence or concurrency fails.
   */
  execute(input: Parameters<DocumentsRepository["renameFolder"]>[0]): Promise<DocumentFolder> {
    const normalized = { ...input, name: documentName(input.name) };
    return repositoryCall(() => this.repo.renameFolder(normalized));
  }
}

/** Deletes an empty folder using optimistic concurrency. */
export class DeleteDocumentFolder {
  /** @param repo - Documents persistence port. */
  constructor(private readonly repo: DocumentsRepository) {}

  /**
   * @param input - Folder identity and expected version.
   * @returns A promise completed after deletion.
   * @throws {DocumentsFailure} When persistence, concurrency or folder constraints fail.
   */
  execute(input: Parameters<DocumentsRepository["deleteFolder"]>[0]): Promise<void> {
    return repositoryCall(() => this.repo.deleteFolder(input));
  }
}

/** Registers validated metadata for an uploaded document. */
export class RegisterDocument {
  /** @param repo - Documents persistence port. */
  constructor(private readonly repo: DocumentsRepository) {}

  /**
   * @param input - Ownership, classification, name and stored-file metadata.
   * @returns The registered document.
   * @throws {DocumentsFailure} When validation or persistence fails.
   */
  execute(input: Parameters<DocumentsRepository["registerDocument"]>[0]): Promise<StoredDocument> {
    const normalized = {
      ...input,
      name: documentName(input.name),
      file: validateStoredFile(input.file),
    };
    return repositoryCall(() => this.repo.registerDocument(normalized));
  }
}

/** Moves document metadata to another folder. */
export class MoveDocument {
  /** @param repo - Documents persistence port. */
  constructor(private readonly repo: DocumentsRepository) {}

  /**
   * @param input - Document identity, destination and expected version.
   * @returns The moved document.
   * @throws {DocumentsFailure} When persistence or concurrency fails.
   */
  execute(input: Parameters<DocumentsRepository["moveDocument"]>[0]): Promise<StoredDocument> {
    return repositoryCall(() => this.repo.moveDocument(input));
  }
}

/** Creates a validated signed-upload request. */
export class CreateDocumentUpload {
  /** @param storage - Document object-storage port. */
  constructor(private readonly storage: DocumentStorage) {}

  /**
   * @param input - Organization and original file name.
   * @returns The signed-upload location.
   * @throws {DocumentsFailure} When validation or storage fails.
   */
  execute(input: { organizationId: OrganizationId; fileName: string }): Promise<{
    uploadUrl: string;
    storageKey: string;
  }> {
    const normalized = { ...input, fileName: documentName(input.fileName) };
    return storageCall(() => this.storage.createUpload(normalized));
  }
}

/** Resolves a signed download URL for registered document metadata. */
export class GetDocumentDownload {
  /**
   * @param repo - Documents persistence port.
   * @param storage - Document object-storage port.
   */
  constructor(
    private readonly repo: DocumentsRepository,
    private readonly storage: DocumentStorage,
  ) {}

  /**
   * @param input - Organization and document identity.
   * @returns A short-lived download URL.
   * @throws {DocumentsFailure} When the document is absent or a boundary fails.
   */
  async execute(input: { organizationId: OrganizationId; documentId: DocumentId }): Promise<string> {
    const document = await repositoryCall(() => this.repo.findDocument(input.organizationId, input.documentId));
    if (!document) throw new DocumentsFailure("DOCUMENT_NOT_FOUND", "El documento no existe.");
    return storageCall(() => this.storage.createDownload(document.file.storageKey));
  }
}

/** Removes a stored object before committing deletion of its metadata. */
export class DeleteDocument {
  /**
   * @param repo - Documents persistence port.
   * @param storage - Document object-storage port.
   */
  constructor(
    private readonly repo: DocumentsRepository,
    private readonly storage: DocumentStorage,
  ) {}

  /**
   * @param input - Organization, document identity and expected version.
   * @returns A promise completed after object and metadata deletion.
   * @throws {DocumentsFailure} When the document is absent or either boundary fails.
   */
  async execute(input: {
    organizationId: OrganizationId;
    documentId: DocumentId;
    expectedVersion: number;
  }): Promise<void> {
    const document = await repositoryCall(() => this.repo.findDocument(input.organizationId, input.documentId));
    if (!document) throw new DocumentsFailure("DOCUMENT_NOT_FOUND", "El documento no existe.");
    await storageCall(() => this.storage.delete(document.file.storageKey));
    await repositoryCall(() => this.repo.deleteDocument(input));
  }
}

async function repositoryCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof DocumentsFailure) throw cause;
    throw new DocumentsFailure("DOCUMENT_REPOSITORY_UNAVAILABLE", "No se pudo acceder a los documentos.", { cause });
  }
}

async function storageCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof DocumentsFailure) throw cause;
    throw new DocumentsFailure("DOCUMENT_STORAGE_UNAVAILABLE", "No se pudo acceder al archivo.", { cause });
  }
}
