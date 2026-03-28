// AcceptInvitationUseCase — validates a token and creates the membership for the accepting user.
// Role: application — owns all business validation: token existence, expiry, email match, duplicate prevention.
// Invariant: on success, both tenant_memberships insert and invitation accepted_at update are applied atomically via the repository.

import { UseCase } from "@/src/core/domain/use-case";
import { Result } from "@/src/core/domain/result";
import { AcceptedInvitation } from "../../domain/invitation";
import { IMembershipsRepository } from "../../domain/memberships-repository";

interface Input {
    token:     string;
    userId:    string;
    userEmail: string;
}

export class AcceptInvitationUseCase extends UseCase<Input, AcceptedInvitation> {
    constructor(private readonly repo: IMembershipsRepository) {
        super();
    }

    async execute(input: Input): Promise<Result<AcceptedInvitation>> {
        return this.repo.acceptInvitation(input);
    }
}
