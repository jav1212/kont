// GetMyReferralUseCase — devuelve código, vínculo, stats y crédito del tenant.

import { UseCase } from "@/src/core/domain/use-case";
import { Result }  from "@/src/core/domain/result";
import { IReferralsRepository } from "../../domain/referrals-repository";
import { ReferralStats }        from "../../domain/referral-stats";

interface Input {
    tenantId: string;
}

export interface MyReferralOutput {
    referralCode:       string;
    referredBy:         string | null;
    stats:              ReferralStats;
    availableCreditUsd: number;
}

export class GetMyReferralUseCase extends UseCase<Input, MyReferralOutput> {
    constructor(private readonly repo: IReferralsRepository) { super(); }

    async execute({ tenantId }: Input): Promise<Result<MyReferralOutput>> {
        const infoRes = await this.repo.getTenantReferralInfo(tenantId);
        if (infoRes.isFailure) return Result.fail(infoRes.getError());

        const statsRes = await this.repo.getReferralStats(tenantId);
        if (statsRes.isFailure) return Result.fail(statsRes.getError());

        const availRes = await this.repo.getAvailableCreditUsd(tenantId);
        if (availRes.isFailure) return Result.fail(availRes.getError());

        const info = infoRes.getValue();
        return Result.success({
            referralCode:       info.referralCode,
            referredBy:         info.referredBy,
            stats:              statsRes.getValue(),
            availableCreditUsd: availRes.getValue(),
        });
    }
}
