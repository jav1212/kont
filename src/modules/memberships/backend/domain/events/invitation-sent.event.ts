// InvitationSentPayload — emitted after an invitation is persisted and the email dispatched.
export interface InvitationSentPayload {
    tenantOwnerId: string;
    invitedBy:     string;
    invitedEmail:  string;
    role:          string;
}
