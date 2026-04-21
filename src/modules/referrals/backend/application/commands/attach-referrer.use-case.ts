// AttachReferrerUseCase — vincula un tenant con su referidor a partir del código.
// Idempotente: si ya hay referred_by o el código coincide con el propio, no-op.

import { UseCase } from "@/src/core/domain/use-case";
import { Result }  from "@/src/core/domain/result";
import { IReferralsRepository } from "../../domain/referrals-repository";

interface Input {
    tenantId: string;
    code:     string;
}

interface Output {
    attached: boolean;     // true si se estableció el vínculo en esta llamada
    reason?:  string;      // explicación si no se vinculó (ya tenía, auto-ref, código inválido)
}

export class AttachReferrerUseCase extends UseCase<Input, Output> {
    constructor(private readonly repo: IReferralsRepository) { super(); }

    async execute({ tenantId, code }: Input): Promise<Result<Output>> {
        const clean = code?.trim().toUpperCase() ?? "";
        if (!clean) return Result.fail("Código requerido");

        const infoRes = await this.repo.getTenantReferralInfo(tenantId);
        if (infoRes.isFailure) return Result.fail(infoRes.getError());

        const info = infoRes.getValue();

        if (info.referredBy) {
            return Result.success({ attached: false, reason: "already_attached" });
        }
        if (info.referralCode === clean) {
            return Result.success({ attached: false, reason: "self_referral" });
        }

        const lookupRes = await this.repo.findTenantIdByReferralCode(clean);
        if (lookupRes.isFailure) return Result.fail(lookupRes.getError());

        const referrerTenantId = lookupRes.getValue();
        if (!referrerTenantId) {
            return Result.success({ attached: false, reason: "invalid_code" });
        }
        if (referrerTenantId === tenantId) {
            return Result.success({ attached: false, reason: "self_referral" });
        }

        const saveRes = await this.repo.setReferredBy(tenantId, referrerTenantId);
        if (saveRes.isFailure) return Result.fail(saveRes.getError());

        return Result.success({ attached: true });
    }
}
