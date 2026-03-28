// GetMembersUseCase — lists all accepted members and pending invitations for a tenant.
// Role: application — enforces that only owners and admins can list members.
// Invariant: contables are forbidden from listing members; pending invitations are deduplicated against accepted members.

import { UseCase } from "@/src/core/domain/use-case";
import { Result } from "@/src/core/domain/result";
import { Membership } from "../../domain/membership";
import { IMembershipsRepository } from "../../domain/memberships-repository";

interface Input {
    tenantOwnerId: string;
    callerRole:    string;
}

export class GetMembersUseCase extends UseCase<Input, Membership[]> {
    constructor(private readonly repo: IMembershipsRepository) {
        super();
    }

    async execute({ tenantOwnerId, callerRole }: Input): Promise<Result<Membership[]>> {
        if (callerRole === "contable") {
            return Result.fail("Sin permiso");
        }

        return this.repo.getMembers(tenantOwnerId);
    }
}
