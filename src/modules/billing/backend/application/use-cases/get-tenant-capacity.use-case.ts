// GetTenantCapacityUseCase — computes the tenant's current resource usage against plan limits.
// Role: application — aggregates plan limits, company count, and employee counts per company.
// Invariant: remaining === null when the plan has no cap (unlimited tier).

import { UseCase } from "@/src/core/domain/use-case";
import { Result } from "@/src/core/domain/result";
import { TenantCapacity } from "../../domain/capacity";
import { IBillingRepository } from "../../domain/billing-repository";

interface Input {
    userId: string;
}

export class GetTenantCapacityUseCase extends UseCase<Input, TenantCapacity> {
    constructor(private readonly repo: IBillingRepository) {
        super();
    }

    async execute({ userId }: Input): Promise<Result<TenantCapacity>> {
        return this.repo.getCapacity(userId);
    }
}
