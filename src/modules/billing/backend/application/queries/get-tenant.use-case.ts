// GetTenantUseCase — retrieves the tenant entity for the authenticated user.
// Role: application — orchestrates the query through the billing repository port.
// Invariant: returns NOT_FOUND as a failure if no tenant row exists for the given userId.

import { UseCase } from "@/src/core/domain/use-case";
import { Result } from "@/src/core/domain/result";
import { Tenant } from "../../domain/tenant";
import { IBillingRepository } from "../../domain/billing-repository";

interface Input {
    userId: string;
}

export class GetTenantUseCase extends UseCase<Input, Tenant> {
    constructor(private readonly repo: IBillingRepository) {
        super();
    }

    async execute({ userId }: Input): Promise<Result<Tenant>> {
        return this.repo.getTenant(userId);
    }
}
