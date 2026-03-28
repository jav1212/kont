// DocumentDeletedPayload — emitted after a document record and its storage file are removed.
export interface DocumentDeletedPayload {
    documentId:  string;
    storagePath: string;
}
