// FolderCreatedPayload — emitted after a document folder is successfully persisted.
export interface FolderCreatedPayload {
    folderId:  string;
    name:      string;
    createdBy: string;
    parentId:  string | null;
    companyId: string | null;
}
