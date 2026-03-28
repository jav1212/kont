// RevokeMembershipUseCase — revokes an accepted membership or deletes a pending invitation.
// Role: application — enforces authorization: contables cannot revoke; admins cannot revoke owners; owners cannot self-revoke.
// Invariant: the operation targets either tenant_memberships or tenant_invitations — never both.

import { UseCase } from "@/src/core/domain/use-case";
import { Result } from "@/src/core/domain/result";
import { IMembershipsRepository } from "../../domain/memberships-repository";

interface Input {
    tenantOwnerId: string;
    memberId:      string;
    callerRole:    string;
}

export class RevokeMembershipUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: IMembershipsRepository) {
        super();
    }

    async execute({ tenantOwnerId, memberId, callerRole }: Input): Promise<Result<void>> {
        if (callerRole === "contable") {
            return Result.fail("Insufficient permissions");
        }

        // Attempt to revoke an accepted membership first.
        const memberResult = await this.repo.revokeMembership(tenantOwnerId, memberId);

        if (memberResult.isSuccess) {
            const { memberRole, isTenantOwner } = memberResult.getValue();

            if (callerRole === "admin" && memberRole === "owner") {
                return Result.fail("Cannot remove the owner");
            }

            if (isTenantOwner) {
                return Result.fail("Cannot remove the tenant owner");
            }

            return Result.success(undefined);
        }

        // Not an accepted membership — try pending invitation.
        const invResult = await this.repo.revokeInvitation(tenantOwnerId, memberId);

        if (invResult.isFailure) {
            return Result.fail("Membership not found");
        }

        return Result.success(undefined);
    }
}
