// CompanyUpdatedPayload — emitted after a company record is successfully updated.
export interface CompanyUpdatedPayload {
    companyId: string;
    /** Field names that were included in the update (keys of the partial update input). */
    updatedFields: string[];
}
