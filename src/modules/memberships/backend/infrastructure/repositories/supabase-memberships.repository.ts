// SupabaseMembershipsRepository — Supabase implementation of IMembershipsRepository.
// Role: infrastructure — all DB access for memberships and invitations lives here.
// Invariant: uses service-role client (ServerSupabaseSource) so it can call auth.admin APIs.

import { Result } from "@/src/core/domain/result";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { IMembershipsRepository, SendInvitationInput } from "../../domain/memberships-repository";
import { Membership, UserMembership, MemberRole } from "../../domain/membership";
import { Invitation, AcceptedInvitation } from "../../domain/invitation";

// Raw DB row shapes — never exported beyond this file.
interface RawMembershipRow {
    id:          string;
    member_id:   string;
    role:        string;
    invited_by:  string;
    accepted_at: string | null;
    revoked_at:  string | null;
    created_at:  string;
}

interface RawInvitationRow {
    id:         string;
    email:      string;
    role:       string;
    created_at: string;
    expires_at: string;
}

interface RawUserMembershipRow {
    tenant_id:   string;
    role:        string;
    accepted_at: string;
}

export class SupabaseMembershipsRepository implements IMembershipsRepository {
    constructor(private readonly source: ServerSupabaseSource) {}

    async getUserMemberships(userId: string): Promise<Result<UserMembership[]>> {
        const { data, error } = await this.source.instance
            .from("tenant_memberships")
            .select("tenant_id, role, accepted_at")
            .eq("member_id", userId)
            .not("accepted_at", "is", null)
            .is("revoked_at", null)
            .order("created_at", { ascending: true });

        if (error) return Result.fail(error.message);

        const rows = (data ?? []) as unknown as RawUserMembershipRow[];

        const emailMap: Record<string, string> = {};
        for (const row of rows) {
            const { data: userData } = await this.source.instance.auth.admin.getUserById(row.tenant_id);
            if (userData?.user?.email) {
                emailMap[row.tenant_id] = userData.user.email;
            }
        }

        const result: UserMembership[] = rows.map((row) => ({
            tenantId:    row.tenant_id,
            role:        row.role as MemberRole,
            tenantEmail: emailMap[row.tenant_id] ?? row.tenant_id,
            isOwn:       row.tenant_id === userId,
        }));

        result.sort((a, b) => {
            if (a.isOwn && !b.isOwn) return -1;
            if (!a.isOwn && b.isOwn) return 1;
            return a.tenantEmail.localeCompare(b.tenantEmail);
        });

        return Result.success(result);
    }

    async getMembers(tenantOwnerId: string): Promise<Result<Membership[]>> {
        const { data: memberships, error } = await this.source.instance
            .from("tenant_memberships")
            .select("id, member_id, role, invited_by, accepted_at, revoked_at, created_at")
            .eq("tenant_id", tenantOwnerId)
            .is("revoked_at", null)
            .order("created_at", { ascending: true });

        if (error) return Result.fail(error.message);

        const rows = (memberships ?? []) as unknown as RawMembershipRow[];

        const members: Membership[] = await Promise.all(
            rows.map(async (row) => {
                const { data: userData } = await this.source.instance.auth.admin.getUserById(row.member_id);
                return {
                    id:         row.id,
                    memberId:   row.member_id,
                    email:      userData?.user?.email ?? row.member_id,
                    role:       row.role as MemberRole,
                    acceptedAt: row.accepted_at,
                    createdAt:  row.created_at,
                    pending:    false,
                };
            })
        );

        const acceptedEmails = new Set(members.map((m) => m.email.toLowerCase()));

        const { data: pendingInvites } = await this.source.instance
            .from("tenant_invitations")
            .select("id, email, role, created_at, expires_at")
            .eq("tenant_id", tenantOwnerId)
            .is("accepted_at", null)
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: true });

        const pending: Membership[] = ((pendingInvites ?? []) as unknown as RawInvitationRow[])
            .filter((inv) => !acceptedEmails.has(inv.email.toLowerCase()))
            .map((inv) => ({
                id:         inv.id,
                memberId:   null,
                email:      inv.email,
                role:       inv.role as MemberRole,
                acceptedAt: null,
                createdAt:  inv.created_at,
                pending:    true,
                expiresAt:  inv.expires_at,
            }));

        return Result.success([...members, ...pending]);
    }

    async sendInvitation(input: SendInvitationInput): Promise<Result<Invitation>> {
        const { data: inv, error } = await this.source.instance
            .from("tenant_invitations")
            .insert({
                tenant_id:  input.tenantOwnerId,
                invited_by: input.invitedBy,
                email:      input.email,
                role:       input.role,
            })
            .select("id, token, expires_at")
            .single();

        if (error) return Result.fail(error.message);

        const row = inv as { id: string; token: string; expires_at: string };

        return Result.success({
            id:           row.id,
            invitationId: row.id,
            token:        row.token,
            expiresAt:    row.expires_at,
            acceptUrl:    "", // filled by use case after construction
        });
    }

    async revokeMembership(
        tenantOwnerId: string,
        memberId: string
    ): Promise<Result<{ memberRole: MemberRole; isTenantOwner: boolean }>> {
        const { data: membership } = await this.source.instance
            .from("tenant_memberships")
            .select("id, role, member_id")
            .eq("id", memberId)
            .eq("tenant_id", tenantOwnerId)
            .is("revoked_at", null)
            .single();

        if (!membership) return Result.fail("not_found");

        const row = membership as { id: string; role: string; member_id: string };

        const { error } = await this.source.instance
            .from("tenant_memberships")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", memberId);

        if (error) return Result.fail(error.message);

        return Result.success({
            memberRole:    row.role as MemberRole,
            isTenantOwner: row.role === "owner" && row.member_id === tenantOwnerId,
        });
    }

    async revokeInvitation(tenantOwnerId: string, invitationId: string): Promise<Result<void>> {
        const { data: invitation } = await this.source.instance
            .from("tenant_invitations")
            .select("id, role")
            .eq("id", invitationId)
            .eq("tenant_id", tenantOwnerId)
            .is("accepted_at", null)
            .single();

        if (!invitation) return Result.fail("not_found");

        const { error } = await this.source.instance
            .from("tenant_invitations")
            .delete()
            .eq("id", invitationId);

        if (error) return Result.fail(error.message);

        return Result.success(undefined);
    }

    async acceptInvitation(input: {
        token:     string;
        userId:    string;
        userEmail: string;
    }): Promise<Result<AcceptedInvitation>> {
        const { data: invitation, error: invErr } = await this.source.instance
            .from("tenant_invitations")
            .select("id, tenant_id, email, role, invited_by, expires_at, accepted_at")
            .eq("token", input.token)
            .is("accepted_at", null)
            .single();

        if (invErr || !invitation) return Result.fail("invalid");

        const row = invitation as {
            id: string; tenant_id: string; email: string; role: string;
            invited_by: string; expires_at: string; accepted_at: string | null;
        };

        if (new Date(row.expires_at) < new Date()) return Result.fail("expired");

        if (input.userEmail?.toLowerCase() !== row.email.toLowerCase()) return Result.fail("email_mismatch");

        const { error: mbError } = await this.source.instance
            .from("tenant_memberships")
            .insert({
                tenant_id:   row.tenant_id,
                member_id:   input.userId,
                role:        row.role,
                invited_by:  row.invited_by,
                accepted_at: new Date().toISOString(),
            });

        if (mbError && !mbError.message.includes("duplicate")) return Result.fail("server");

        await this.source.instance
            .from("tenant_invitations")
            .update({ accepted_at: new Date().toISOString() })
            .eq("id", row.id);

        return Result.success({ tenantId: row.tenant_id });
    }
}
