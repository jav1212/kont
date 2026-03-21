export interface DocumentFolder {
    id:        string;
    parentId:  string | null;
    name:      string;
    companyId: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}
