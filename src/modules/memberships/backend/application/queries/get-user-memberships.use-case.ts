// GetUserMembershipsUseCase — lists all tenants where the caller is an active member.
// Role: application — includes the caller's own tenant; sorts own tenant first, then alphabetically.
// Invariant: only accepted (non-revoked) memberships are returned.

import { UseCase } from "@/src/core/domain/use-case";
import { Result } from "@/src/core/domain/result";
import { UserMembership } from "../../domain/membership";
import { IMembershipsRepository } from "../../domain/memberships-repository";

interface Input {
    userId: string;
}

export class GetUserMembershipsUseCase extends UseCase<Input, UserMembership[]> {
    constructor(private readonly repo: IMembershipsRepository) {
        super();
    }

    async execute({ userId }: Input): Promise<Result<UserMembership[]>> {
        return this.repo.getUserMemberships(userId);
    }
}
