export interface Document {
    id:          string;
    folderId:    string | null;
    companyId:   string | null;
    name:        string;
    storagePath: string;
    mimeType:    string | null;
    sizeBytes:   number | null;
    uploadedBy:  string;
    createdAt:   string;
    updatedAt:   string;
}
