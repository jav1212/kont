// Invitation domain entity.
// Role: domain — represents a pending invitation sent to a user to join a tenant.
// Invariant: a valid invitation must not be expired and must not have accepted_at set.

export interface Invitation {
    id:        string;
    invitationId: string;
    token:     string;
    expiresAt: string;
    acceptUrl: string;
}

export interface AcceptedInvitation {
    tenantId: string;
}
