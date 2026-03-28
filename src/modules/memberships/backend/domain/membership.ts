// Membership domain entity.
// Role: domain — represents a confirmed or pending membership of a user within a tenant.
// Invariant: pending === true means the user has been invited but has not yet accepted.

export type MemberRole = 'owner' | 'admin' | 'contable';

export interface Membership {
    id:         string;
    memberId:   string | null;
    email:      string;
    role:       MemberRole;
    acceptedAt: string | null;
    createdAt:  string;
    pending:    boolean;
    expiresAt?: string;
}

export interface UserMembership {
    tenantId:    string;
    role:        MemberRole;
    tenantEmail: string;
    isOwn:       boolean;
}
