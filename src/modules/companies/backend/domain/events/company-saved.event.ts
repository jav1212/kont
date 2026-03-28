// CompanySavedPayload — emitted after a new company record is successfully persisted.
export interface CompanySavedPayload {
    companyId: string;
    ownerId:   string;
    name:      string;
}
