// DocumentRegisteredPayload — emitted after a document record is successfully registered.
export interface DocumentRegisteredPayload {
    documentId:  string;
    name:        string;
    uploadedBy:  string;
    folderId:    string | null;
    companyId:   string | null;
    mimeType:    string | null;
    sizeBytes:   number | null;
}
