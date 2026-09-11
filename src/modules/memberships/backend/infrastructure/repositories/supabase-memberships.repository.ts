// SupabaseMembershipsRepository — Supabase implementation of IMembershipsRepository.
// Role: infrastructure — all DB access for memberships and invitations lives here.
// Invariant: uses service-role client (ServerSupabaseSource) so it can call auth.admin APIs.

import { Result } from "@/src/core/domain/result";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { legacyRoleFromCanonical } from "@/src/shared/backend/utils/tenant-organization-access";
import {
    CreatedDirectMember,
    CreateDirectMemberInput,
    IMembershipsRepository,
    InvitationContext,
    SendInvitationInput,
} from "../../domain/memberships-repository";
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

interface DirectMemberLegacyMembershipRow {
    tenant_id: string;
    member_id: string;
    role: string;
    accepted_at: string | null;
    revoked_at: string | null;
}

interface DirectMemberOrganizationRow {
    id: string;
    legacy_tenant_id: string | null;
    status: string;
}

interface DirectMemberOrganizationMembershipRow {
    organization_id: string;
    user_id: string;
    role: string;
    role_id: string | null;
    status: string;
}

interface DirectMemberOrganizationRoleRow {
    id: string;
    organization_id: string | null;
    code: string;
    status: string;
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
        const tenantIds = rows.map((row) => row.tenant_id);
        const { data: organizations, error: organizationsError } = tenantIds.length === 0
            ? { data: [], error: null }
            : await this.source.instance
                .from('organizations')
                .select('id, legacy_tenant_id')
                .in('legacy_tenant_id', tenantIds)
                .eq('status', 'active');
        if (organizationsError) return Result.fail(organizationsError.message);

        // The Web tenant bridge is authoritative only while its organization is
        // active. Unknown and suspended mappings intentionally disappear from
        // the directory so they cannot be restored from browser storage.
        const organizationByTenantId = new Map(
            ((organizations ?? []) as Array<{ id: string; legacy_tenant_id: string | null }>)
                .filter((organization): organization is { id: string; legacy_tenant_id: string } => organization.legacy_tenant_id !== null)
                .map((organization) => [organization.legacy_tenant_id, organization.id]),
        );
        const bridgedRows = rows.filter((row) => organizationByTenantId.has(row.tenant_id));
        const organizationIds = [...new Set(bridgedRows.map((row) => organizationByTenantId.get(row.tenant_id)!))];
        const { data: organizationMemberships, error: organizationMembershipsError } = organizationIds.length === 0
            ? { data: [], error: null }
            : await this.source.instance
                .from('organization_memberships')
                .select('organization_id, role_id, status')
                .eq('user_id', userId)
                .eq('status', 'active')
                .in('organization_id', organizationIds);
        if (organizationMembershipsError) return Result.fail(organizationMembershipsError.message);

        const membershipByOrganizationId = new Map(
            ((organizationMemberships ?? []) as Array<{ organization_id: string; role_id: string | null; status: string }>)
                .filter((membership): membership is { organization_id: string; role_id: string; status: string } => membership.status === 'active' && membership.role_id !== null)
                .map((membership) => [membership.organization_id, membership]),
        );
        const roleIds = [...new Set([...membershipByOrganizationId.values()].map((membership) => membership.role_id))];
        const { data: organizationRoles, error: organizationRolesError } = roleIds.length === 0
            ? { data: [], error: null }
            : await this.source.instance
                .from('organization_roles')
                .select('id, organization_id, code, status, organization_role_permissions(permission_code)')
                .eq('status', 'active')
                .in('id', roleIds);
        if (organizationRolesError) return Result.fail(organizationRolesError.message);

        const rolesByOrganizationId = new Map(
            ((organizationRoles ?? []) as Array<{ id: string; organization_id: string; code: string; status: string; organization_role_permissions: Array<{ permission_code: string }> }>)
                .filter((role) => role.status === 'active' && membershipByOrganizationId.get(role.organization_id)?.role_id === role.id)
                .map((role) => [role.organization_id, {
                    role: legacyRoleFromCanonical(role.code),
                    permissions: role.organization_role_permissions.map((permission) => permission.permission_code),
                }]),
        );
        const activeRows = bridgedRows.filter((row) => {
            const organizationId = organizationByTenantId.get(row.tenant_id)!;
            return rolesByOrganizationId.has(organizationId);
        });

        const emailMap: Record<string, string> = {};
        for (const row of activeRows) {
            const { data: userData } = await this.source.instance.auth.admin.getUserById(row.tenant_id);
            if (userData?.user?.email) {
                emailMap[row.tenant_id] = userData.user.email;
            }
        }

        const avatarMap: Record<string, string | null> = {};
        const activeTenantIdList = activeRows.map((row) => row.tenant_id);
        if (activeTenantIdList.length > 0) {
            const { data: profiles } = await this.source.instance
                .from("profiles")
                .select("id, avatar_url")
                .in("id", activeTenantIdList);
            for (const p of ((profiles ?? []) as Array<{ id: string; avatar_url: string | null }>)) {
                avatarMap[p.id] = p.avatar_url;
            }
        }

        const result: UserMembership[] = activeRows.map((row) => ({
            tenantId:        row.tenant_id,
            role:            rolesByOrganizationId.get(organizationByTenantId.get(row.tenant_id)!)!.role,
            tenantEmail:     emailMap[row.tenant_id] ?? row.tenant_id,
            tenantAvatarUrl: avatarMap[row.tenant_id] ?? null,
            isOwn:           row.tenant_id === userId,
            permissions:     rolesByOrganizationId.get(organizationByTenantId.get(row.tenant_id)!)!.permissions,
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

    async getInvitationContext(tenantOwnerId: string, inviterId: string): Promise<Result<InvitationContext>> {
        const { data: inviter } = await this.source.instance.auth.admin.getUserById(inviterId);
        const inviterEmail = inviter?.user?.email ?? inviterId;

        const { data: profile } = await this.source.instance
            .from("profiles")
            .select("name, email")
            .eq("id", tenantOwnerId)
            .maybeSingle();

        const profileRow = profile as { name: string | null; email: string | null } | null;

        let tenantName = profileRow?.name?.trim() || profileRow?.email?.trim() || "";
        if (!tenantName) {
            const { data: owner } = await this.source.instance.auth.admin.getUserById(tenantOwnerId);
            tenantName = owner?.user?.email ?? tenantOwnerId;
        }

        return Result.success({ inviterEmail, tenantName });
    }

    /**
     * Creates a confirmed Auth identity and confirms its complete legacy and organization access linkage.
     *
     * @param input - Tenant-scoped credentials and trusted application metadata.
     * @returns The created identity, or an expected duplicate/provisioning failure code.
     * @throws Never throws expected failures; provider faults are returned as Result failures.
     */
    async createDirectMember(input: CreateDirectMemberInput): Promise<Result<CreatedDirectMember>> {
        try {
            const { data: ready, error: readinessError } = await this.source.instance
                .rpc('membership_direct_provisioning_ready');

            if (readinessError || ready !== true) {
                return Result.fail('provisioning_unavailable');
            }

            const { data, error } = await this.source.instance.auth.admin.createUser({
                email: input.email,
                password: input.password,
                email_confirm: true,
                app_metadata: {
                    provisioned_membership: {
                        tenant_id: input.tenantOwnerId,
                        role: input.role,
                        invited_by: input.invitedBy,
                    },
                },
            });

            if (error) {
                const code = (error as { code?: unknown }).code;
                if (code === 'email_exists' || code === 'user_already_exists') return Result.fail('email_already_exists');
                if (code === 'weak_password' || code === 'password_not_allowed') return Result.fail('password_requirements');
                if (code === 'password_too_short') return Result.fail('invalid_password');
                if (code === 'email_address_invalid' || code === 'email_invalid' || code === 'invalid_email') return Result.fail('invalid_email');
                return Result.fail('auth_create_failed');
            }

            const user = data.user;
            if (!user?.id || !user.email) return Result.fail('auth_create_failed');

            const linked = await this.hasVerifiedDirectMemberLinkage(user.id, input);
            if (!linked) return Result.fail('provisioning_incomplete');

            return Result.success({ id: user.id, email: user.email, role: input.role });
        } catch {
            return Result.fail('auth_create_failed');
        }
    }

    /**
     * Checks the durable access rows that must exist before a direct member can be reported as created.
     *
     * @param memberId - Auth identity returned by the trusted Auth admin API.
     * @param input - Expected legacy tenant, organization role, and inviting actor context.
     * @returns True only when the exact active legacy membership and its canonical organization role are present.
     * @throws Never throws expected failures; unavailable or malformed persistence reads return false.
     */
    private async hasVerifiedDirectMemberLinkage(
        memberId: string,
        input: CreateDirectMemberInput,
    ): Promise<boolean> {
        try {
            const { data: legacyMembership, error: legacyError } = await this.source.instance
                .from('tenant_memberships')
                .select('tenant_id, member_id, role, accepted_at, revoked_at')
                .eq('tenant_id', input.tenantOwnerId)
                .eq('member_id', memberId)
                .eq('role', input.role)
                .not('accepted_at', 'is', null)
                .is('revoked_at', null)
                .maybeSingle();
            const legacy = legacyMembership as DirectMemberLegacyMembershipRow | null;
            if (legacyError || !legacy
                || legacy.tenant_id !== input.tenantOwnerId
                || legacy.member_id !== memberId
                || legacy.role !== input.role
                || !legacy.accepted_at
                || legacy.revoked_at !== null) return false;

            const { data: organizationData, error: organizationError } = await this.source.instance
                .from('organizations')
                .select('id, legacy_tenant_id, status')
                .eq('legacy_tenant_id', input.tenantOwnerId)
                .eq('status', 'active')
                .maybeSingle();
            const organization = organizationData as DirectMemberOrganizationRow | null;
            if (organizationError || !organization
                || organization.legacy_tenant_id !== input.tenantOwnerId
                || organization.status !== 'active') return false;

            const expectedRole = directMemberOrganizationRole(input.role);
            const { data: organizationMembershipData, error: organizationMembershipError } = await this.source.instance
                .from('organization_memberships')
                .select('organization_id, user_id, role, role_id, status')
                .eq('organization_id', organization.id)
                .eq('user_id', memberId)
                .eq('role', expectedRole)
                .eq('status', 'active')
                .maybeSingle();
            const organizationMembership = organizationMembershipData as DirectMemberOrganizationMembershipRow | null;
            if (organizationMembershipError || !organizationMembership
                || organizationMembership.organization_id !== organization.id
                || organizationMembership.user_id !== memberId
                || organizationMembership.role !== expectedRole
                || organizationMembership.status !== 'active'
                || !organizationMembership.role_id) return false;

            const { data: roleData, error: roleError } = await this.source.instance
                .from('organization_roles')
                .select('id, organization_id, code, status')
                .eq('id', organizationMembership.role_id)
                .eq('organization_id', organization.id)
                .eq('code', expectedRole)
                .eq('status', 'active')
                .maybeSingle();
            const role = roleData as DirectMemberOrganizationRoleRow | null;
            return !roleError
                && role?.id === organizationMembership.role_id
                && role.organization_id === organization.id
                && role.code === expectedRole
                && role.status === 'active';
        } catch {
            return false;
        }
    }
}

/**
 * Maps the legacy Web direct-member roles to their canonical organization role codes.
 *
 * @param role - Validated legacy role accepted by the direct-member command.
 * @returns The equivalent organization-scoped role code.
 * @throws Never throws because the application layer validates the role before persistence.
 */
function directMemberOrganizationRole(role: CreateDirectMemberInput['role']): string {
    switch (role) {
        case 'contador': return 'accountant';
        case 'vendedor': return 'seller';
        case 'cajero': return 'cashier';
        case 'admin': return 'admin';
    }
}
