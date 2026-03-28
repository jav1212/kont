// GetPlansUseCase — retrieves all active plans with their associated module slugs.
// Role: application — public query, no tenant context required.
// Invariant: only active plans are returned; ordering is by price ascending.

import { UseCase } from "@/src/core/domain/use-case";
import { Result } from "@/src/core/domain/result";
import { PlanWithModule } from "../../domain/tenant";
import { IBillingRepository } from "../../domain/billing-repository";

export class GetPlansUseCase extends UseCase<void, PlanWithModule[]> {
    constructor(private readonly repo: IBillingRepository) {
        super();
    }

    async execute(): Promise<Result<PlanWithModule[]>> {
        return this.repo.getPlans();
    }
}
