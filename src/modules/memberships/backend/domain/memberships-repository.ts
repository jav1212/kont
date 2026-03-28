// IMembershipsRepository — port contract for all membership and invitation data access.
// Role: domain boundary — infrastructure implements this; application depends only on this interface.
// Invariant: all methods return Result<T>; business rules live in use cases, not this contract.

import { Result } from "@/src/core/domain/result";
import { Membership, UserMembership, MemberRole } from "./membership";
import { AcceptedInvitation, Invitation } from "./invitation";

export interface SendInvitationInput {
    tenantOwnerId: string;
    invitedBy:     string;
    email:         string;
    role:          MemberRole;
}

export interface IMembershipsRepository {
    getUserMemberships(userId: string): Promise<Result<UserMembership[]>>;
    getMembers(tenantOwnerId: string): Promise<Result<Membership[]>>;
    sendInvitation(input: SendInvitationInput): Promise<Result<Invitation>>;
    revokeMembership(tenantOwnerId: string, memberId: string): Promise<Result<{ memberRole: MemberRole; isTenantOwner: boolean }>>;
    revokeInvitation(tenantOwnerId: string, invitationId: string): Promise<Result<void>>;
    acceptInvitation(input: { token: string; userId: string; userEmail: string }): Promise<Result<AcceptedInvitation>>;
}
