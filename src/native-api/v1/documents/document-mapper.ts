import type { NativeDocumentDto,NativeDocumentFolderDto } from "@kontave/native-api-contracts";
import type { DocumentFolder,StoredDocument } from "@kontave/documents-domain";
export const toDocumentDto=(value:StoredDocument):NativeDocumentDto=>({id:value.id,organizationId:value.organizationId,companyId:value.companyId,folderId:value.folderId,name:value.name,contentType:value.file.contentType,sizeBytes:value.file.sizeBytes,uploadedBy:value.uploadedBy,version:value.version,createdAt:value.createdAt,updatedAt:value.updatedAt});
export const toDocumentFolderDto=(value:DocumentFolder):NativeDocumentFolderDto=>({...value});
