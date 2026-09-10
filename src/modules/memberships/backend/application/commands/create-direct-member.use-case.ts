// CreateDirectMemberUseCase — provisions a confirmed credential-based tenant member.
// Role: application — validates the limited direct-provisioning role set and caller hierarchy.

import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import {
    CreatedDirectMember,
    DirectMemberRole,
    IMembershipsRepository,
} from "../../domain/memberships-repository";

/** Input accepted when an owner or administrator creates a member directly. */
export interface CreateDirectMemberInput {
    tenantOwnerId: string;
    invitedBy: string;
    email: string;
    password: string;
    role: DirectMemberRole;
    callerRole: string;
}

/**
 * Creates a tenant member with a password and a confirmed email address.
 *
 * @throws Never throws expected validation or provisioning failures; they are returned as Result failures.
 */
export class CreateDirectMemberUseCase extends UseCase<CreateDirectMemberInput, CreatedDirectMember> {
    /**
     * Creates the use case with the memberships persistence port.
     *
     * @param repo - Port that performs the guarded Auth admin operation.
     * @returns A command bound to the supplied provisioning port; construction performs no I/O.
     * @throws Never throws; expected failures are represented by {@link Result}.
     */
    constructor(private readonly repo: IMembershipsRepository) {
        super();
    }

    /**
     * Validates caller hierarchy and credentials before creating the member.
     *
     * @param input - Tenant-scoped credentials, role, and caller context.
     * @returns The provisioned member or a stable validation/provisioning failure code.
     * @throws Never throws expected failures; they are represented by {@link Result}.
     */
    async execute(input: CreateDirectMemberInput): Promise<Result<CreatedDirectMember>> {
        if (!['owner', 'admin'].includes(input.callerRole)) {
            return Result.fail('insufficient_permissions');
        }

        if (input.callerRole === 'admin' && input.role === 'admin') {
            return Result.fail('admins_cannot_create_admins');
        }

        const email = input.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Result.fail('invalid_email');
        if (input.password.length < 8) return Result.fail('invalid_password');
        if (!['admin', 'contador', 'vendedor', 'cajero'].includes(input.role)) {
            return Result.fail('invalid_role');
        }

        return this.repo.createDirectMember({ ...input, email });
    }
}
