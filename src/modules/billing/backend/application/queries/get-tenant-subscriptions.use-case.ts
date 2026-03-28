// GetTenantSubscriptionsUseCase — retrieves all subscriptions for a given tenant.
// Role: application — supports actingAs flows: the caller passes tenantId (which may differ from userId).
// Invariant: tenantId must be a valid tenant owner ID (not a member ID).

import { UseCase } from "@/src/core/domain/use-case";
import { Result } from "@/src/core/domain/result";
import { Subscription } from "../../domain/subscription";
import { IBillingRepository } from "../../domain/billing-repository";

interface Input {
    tenantId: string;
}

export class GetTenantSubscriptionsUseCase extends UseCase<Input, Subscription[]> {
    constructor(private readonly repo: IBillingRepository) {
        super();
    }

    async execute({ tenantId }: Input): Promise<Result<Subscription[]>> {
        return this.repo.getSubscriptions(tenantId);
    }
}
