// InvitationAcceptedPayload — emitted after a user accepts a membership invitation.
export interface InvitationAcceptedPayload {
    tenantOwnerId: string;
    userId:        string;
    userEmail:     string;
}
