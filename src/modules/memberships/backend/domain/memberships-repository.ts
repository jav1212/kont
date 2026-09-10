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

/** Details required to provision an active member through the trusted Auth admin API. */
export interface CreateDirectMemberInput {
    tenantOwnerId: string;
    invitedBy: string;
    email: string;
    password: string;
    role: DirectMemberRole;
}

/** Roles which can be provisioned with an initial password. */
export type DirectMemberRole = Exclude<MemberRole, 'owner' | 'contable'>;

/** The newly-created Auth identity and its active tenant role. */
export interface CreatedDirectMember {
    id: string;
    email: string;
    role: DirectMemberRole;
}

export interface InvitationContext {
    inviterEmail: string;
    tenantName:   string;
}

export interface IMembershipsRepository {
    getUserMemberships(userId: string): Promise<Result<UserMembership[]>>;
    getMembers(tenantOwnerId: string): Promise<Result<Membership[]>>;
    sendInvitation(input: SendInvitationInput): Promise<Result<Invitation>>;
    revokeMembership(tenantOwnerId: string, memberId: string): Promise<Result<{ memberRole: MemberRole; isTenantOwner: boolean }>>;
    revokeInvitation(tenantOwnerId: string, invitationId: string): Promise<Result<void>>;
    acceptInvitation(input: { token: string; userId: string; userEmail: string }): Promise<Result<AcceptedInvitation>>;
    getInvitationContext(tenantOwnerId: string, inviterId: string): Promise<Result<InvitationContext>>;
    /**
     * Creates a confirmed Auth account whose database trigger provisions one active membership.
     *
     * @param input - Trusted tenant, actor, credentials, and role supplied by the application layer.
     * @returns The provisioned member, or a stable expected failure code.
     * @throws Expected provisioning failures must be returned as Result failures.
     */
    createDirectMember(input: CreateDirectMemberInput): Promise<Result<CreatedDirectMember>>;
}
