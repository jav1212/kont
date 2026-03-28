// GetPaymentRequestsUseCase — lists all payment requests submitted by a tenant.
// Role: application — read-only query ordered by submission date descending.
// Invariant: results are scoped to the given tenantId; no cross-tenant access.

import { UseCase } from "@/src/core/domain/use-case";
import { Result } from "@/src/core/domain/result";
import { PaymentRequest } from "../../domain/tenant";
import { IBillingRepository } from "../../domain/billing-repository";

interface Input {
    tenantId: string;
}

export class GetPaymentRequestsUseCase extends UseCase<Input, PaymentRequest[]> {
    constructor(private readonly repo: IBillingRepository) {
        super();
    }

    async execute({ tenantId }: Input): Promise<Result<PaymentRequest[]>> {
        return this.repo.getPaymentRequests(tenantId);
    }
}
