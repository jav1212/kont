// GetAvailableCreditUseCase — monto USD disponible para descuento del tenant.

import { UseCase } from "@/src/core/domain/use-case";
import { Result }  from "@/src/core/domain/result";
import { IReferralsRepository } from "../../domain/referrals-repository";

interface Input  { tenantId: string; }
interface Output { availableUsd: number; }

export class GetAvailableCreditUseCase extends UseCase<Input, Output> {
    constructor(private readonly repo: IReferralsRepository) { super(); }

    async execute({ tenantId }: Input): Promise<Result<Output>> {
        const res = await this.repo.getAvailableCreditUsd(tenantId);
        if (res.isFailure) return Result.fail(res.getError());
        return Result.success({ availableUsd: res.getValue() });
    }
}
