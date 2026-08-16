import type { CompanyId } from "@kontave/companies-domain";
import { DocumentsFailure, documentName, validateStoredFile, type DocumentFolder, type DocumentFolderId, type DocumentId, type StoredDocument } from "@kontave/documents-domain";
import type { OrganizationId, UserId } from "@kontave/organizations-domain";

export interface DocumentsRepository {
  listDocuments(input:{organizationId:OrganizationId;companyId?:CompanyId|null;folderId?:DocumentFolderId|null}):Promise<readonly StoredDocument[]>;
  listFolders(input:{organizationId:OrganizationId;companyId?:CompanyId|null}):Promise<readonly DocumentFolder[]>;
  createFolder(input:{organizationId:OrganizationId;companyId:CompanyId|null;parentId:DocumentFolderId|null;name:string;createdBy:UserId}):Promise<DocumentFolder>;
  renameFolder(input:{organizationId:OrganizationId;folderId:DocumentFolderId;name:string;expectedVersion:number}):Promise<DocumentFolder>;
  deleteFolder(input:{organizationId:OrganizationId;folderId:DocumentFolderId;expectedVersion:number}):Promise<void>;
  registerDocument(input:{organizationId:OrganizationId;companyId:CompanyId|null;folderId:DocumentFolderId|null;name:string;file:{storageKey:string;contentType:string|null;sizeBytes:number|null};uploadedBy:UserId}):Promise<StoredDocument>;
  moveDocument(input:{organizationId:OrganizationId;documentId:DocumentId;folderId:DocumentFolderId|null;expectedVersion:number}):Promise<StoredDocument>;
  findDocument(organizationId:OrganizationId,id:DocumentId):Promise<StoredDocument|null>;
  deleteDocument(input:{organizationId:OrganizationId;documentId:DocumentId;expectedVersion:number}):Promise<void>;
}
export interface DocumentStorage {
  createUpload(input:{organizationId:OrganizationId;fileName:string}):Promise<{uploadUrl:string;storageKey:string}>;
  createDownload(storageKey:string):Promise<string>;
  delete(storageKey:string):Promise<void>;
}
export class ListDocuments{constructor(private readonly repo:DocumentsRepository){}execute(input:Parameters<DocumentsRepository["listDocuments"]>[0]){return this.repo.listDocuments(input)}}
export class ListDocumentFolders{constructor(private readonly repo:DocumentsRepository){}execute(input:Parameters<DocumentsRepository["listFolders"]>[0]){return this.repo.listFolders(input)}}
export class CreateDocumentFolder{constructor(private readonly repo:DocumentsRepository){}execute(input:Parameters<DocumentsRepository["createFolder"]>[0]){return this.repo.createFolder({...input,name:documentName(input.name)})}}
export class RenameDocumentFolder{constructor(private readonly repo:DocumentsRepository){}execute(input:Parameters<DocumentsRepository["renameFolder"]>[0]){return this.repo.renameFolder({...input,name:documentName(input.name)})}}
export class DeleteDocumentFolder{constructor(private readonly repo:DocumentsRepository){}execute(input:Parameters<DocumentsRepository["deleteFolder"]>[0]){return this.repo.deleteFolder(input)}}
export class RegisterDocument{constructor(private readonly repo:DocumentsRepository){}execute(input:Parameters<DocumentsRepository["registerDocument"]>[0]){return this.repo.registerDocument({...input,name:documentName(input.name),file:validateStoredFile(input.file)})}}
export class MoveDocument{constructor(private readonly repo:DocumentsRepository){}execute(input:Parameters<DocumentsRepository["moveDocument"]>[0]){return this.repo.moveDocument(input)}}
export class CreateDocumentUpload{constructor(private readonly storage:DocumentStorage){}execute(input:{organizationId:OrganizationId;fileName:string}){return this.storage.createUpload({...input,fileName:documentName(input.fileName)})}}
export class GetDocumentDownload{constructor(private readonly repo:DocumentsRepository,private readonly storage:DocumentStorage){}async execute(input:{organizationId:OrganizationId;documentId:DocumentId}){const document=await this.repo.findDocument(input.organizationId,input.documentId);if(!document)throw new DocumentsFailure("DOCUMENT_NOT_FOUND","El documento no existe.");return this.storage.createDownload(document.file.storageKey)}}
export class DeleteDocument{constructor(private readonly repo:DocumentsRepository,private readonly storage:DocumentStorage){}async execute(input:{organizationId:OrganizationId;documentId:DocumentId;expectedVersion:number}){const document=await this.repo.findDocument(input.organizationId,input.documentId);if(!document)throw new DocumentsFailure("DOCUMENT_NOT_FOUND","El documento no existe.");await this.storage.delete(document.file.storageKey);await this.repo.deleteDocument(input)}}
