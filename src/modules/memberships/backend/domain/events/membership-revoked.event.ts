// MembershipRevokedPayload — emitted after a membership or pending invitation is successfully revoked.
export interface MembershipRevokedPayload {
    tenantOwnerId: string;
    memberId:      string;
    revokedBy:     string;
}
