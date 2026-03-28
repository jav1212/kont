// UserUpdatedPayload — emitted after a user profile is successfully updated.
export interface UserUpdatedPayload {
    userId:        string;
    updatedFields: string[];
}
