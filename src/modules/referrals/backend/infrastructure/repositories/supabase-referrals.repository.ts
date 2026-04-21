// SupabaseReferralsRepository — implementación Supabase de IReferralsRepository.
// Role: infraestructura — todas las queries del módulo viven aquí; sin lógica de negocio.
// Invariant: usa service-role vía ServerSupabaseSource; el scoping por tenant es explícito.

import { Result } from "@/src/core/domain/result";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import {
    IReferralsRepository,
    TenantReferralInfo,
    ConsumeCreditsResult,
} from "../../domain/referrals-repository";
import { ReferralCode } from "../../domain/referral-code";
import {
    ReferralCredit,
    ReferralCreditStatus,
    ReferralRedemption,
} from "../../domain/referral-credit";
import { ReferralStats } from "../../domain/referral-stats";

interface RawTenantReferralRow {
    id:              string;
    referral_code:   string;
    referred_by:     string | null;
    last_payment_at: string | null;
}

interface RawReferralCreditRow {
    id:                        string;
    referrer_tenant_id:        string;
    referred_tenant_id:        string;
    source_payment_request_id: string;
    amount_usd:                number;
    remaining_usd:             number;
    status:                    string;
    created_at:                string;
}

interface RawReferralRedemptionRow {
    id:                 string;
    credit_id:          string;
    payment_request_id: string;
    amount_usd:         number;
    created_at:         string;
}

function normalizeCredit(raw: RawReferralCreditRow): ReferralCredit {
    return {
        id:                     raw.id,
        referrerTenantId:       raw.referrer_tenant_id,
        referredTenantId:       raw.referred_tenant_id,
        sourcePaymentRequestId: raw.source_payment_request_id,
        amountUsd:              Number(raw.amount_usd),
        remainingUsd:           Number(raw.remaining_usd),
        status:                 raw.status as ReferralCreditStatus,
        createdAt:              raw.created_at,
    };
}

function normalizeRedemption(raw: RawReferralRedemptionRow): ReferralRedemption {
    return {
        id:               raw.id,
        creditId:         raw.credit_id,
        paymentRequestId: raw.payment_request_id,
        amountUsd:        Number(raw.amount_usd),
        createdAt:        raw.created_at,
    };
}

export class SupabaseReferralsRepository implements IReferralsRepository {
    constructor(private readonly source: ServerSupabaseSource) {}

    async getTenantReferralInfo(tenantId: string): Promise<Result<TenantReferralInfo>> {
        const { data, error } = await this.source.instance
            .from("tenants")
            .select("id, referral_code, referred_by, last_payment_at")
            .eq("id", tenantId)
            .single<RawTenantReferralRow>();

        if (error || !data) return Result.fail(error?.message ?? "Tenant not found");

        return Result.success({
            tenantId:      data.id,
            referralCode:  data.referral_code,
            referredBy:    data.referred_by,
            lastPaymentAt: data.last_payment_at,
        });
    }

    async findTenantIdByReferralCode(code: string): Promise<Result<string | null>> {
        const { data, error } = await this.source.instance
            .from("tenants")
            .select("id")
            .eq("referral_code", code)
            .maybeSingle<{ id: string }>();

        if (error) return Result.fail(error.message);
        return Result.success(data?.id ?? null);
    }

    async setReferredBy(tenantId: string, referrerTenantId: string): Promise<Result<void>> {
        const { error } = await this.source.instance
            .from("tenants")
            .update({ referred_by: referrerTenantId, updated_at: new Date().toISOString() })
            .eq("id", tenantId)
            .is("referred_by", null);    // no sobrescribir si ya hay referidor

        if (error) return Result.fail(error.message);
        return Result.success();
    }

    async getReferralStats(tenantId: string): Promise<Result<ReferralStats>> {
        const [refsRes, creditsRes] = await Promise.all([
            this.source.instance
                .from("tenants")
                .select("id", { count: "exact", head: true })
                .eq("referred_by", tenantId),
            this.source.instance
                .from("referral_credits")
                .select("amount_usd, remaining_usd, status")
                .eq("referrer_tenant_id", tenantId),
        ]);

        if (refsRes.error)    return Result.fail(refsRes.error.message);
        if (creditsRes.error) return Result.fail(creditsRes.error.message);

        const totalReferrals = refsRes.count ?? 0;
        const credits = (creditsRes.data ?? []) as Array<{
            amount_usd:    number;
            remaining_usd: number;
            status:        string;
        }>;

        const totalEarnedUsd     = credits.reduce((acc, c) => acc + Number(c.amount_usd), 0);
        const availableCreditUsd = credits
            .filter((c) => c.status !== "consumed")
            .reduce((acc, c) => acc + Number(c.remaining_usd), 0);

        return Result.success({
            totalReferrals,
            activatedReferrals: credits.length,
            totalEarnedUsd:     Math.round(totalEarnedUsd * 100) / 100,
            availableCreditUsd: Math.round(availableCreditUsd * 100) / 100,
        });
    }

    async getAvailableCreditUsd(tenantId: string): Promise<Result<number>> {
        const { data, error } = await this.source.instance
            .from("referral_credits")
            .select("remaining_usd")
            .eq("referrer_tenant_id", tenantId)
            .neq("status", "consumed");

        if (error) return Result.fail(error.message);

        const total = (data ?? []).reduce(
            (acc, row) => acc + Number((row as { remaining_usd: number }).remaining_usd),
            0,
        );
        return Result.success(Math.round(total * 100) / 100);
    }

    async grantCredit(input: {
        referrerTenantId:       string;
        referredTenantId:       string;
        sourcePaymentRequestId: string;
        amountUsd:              number;
    }): Promise<Result<ReferralCredit | null>> {
        // Si ya existe por UNIQUE(referred_tenant_id), devolvemos null sin error.
        const { data: existing } = await this.source.instance
            .from("referral_credits")
            .select("id")
            .eq("referred_tenant_id", input.referredTenantId)
            .maybeSingle<{ id: string }>();

        if (existing) return Result.success(null);

        const { data, error } = await this.source.instance
            .from("referral_credits")
            .insert({
                referrer_tenant_id:        input.referrerTenantId,
                referred_tenant_id:        input.referredTenantId,
                source_payment_request_id: input.sourcePaymentRequestId,
                amount_usd:                input.amountUsd,
                remaining_usd:             input.amountUsd,
                status:                    "available",
            })
            .select()
            .single<RawReferralCreditRow>();

        if (error || !data) return Result.fail(error?.message ?? "Insert failed");
        return Result.success(normalizeCredit(data));
    }

    async consumeCreditsForPayment(input: {
        tenantId:          string;
        paymentRequestId:  string;
        invoiceAmountUsd:  number;
    }): Promise<Result<ConsumeCreditsResult>> {
        const { data: available, error: fetchErr } = await this.source.instance
            .from("referral_credits")
            .select("*")
            .eq("referrer_tenant_id", input.tenantId)
            .neq("status", "consumed")
            .order("created_at", { ascending: true });

        if (fetchErr) return Result.fail(fetchErr.message);

        const credits = (available ?? []) as RawReferralCreditRow[];
        if (credits.length === 0) {
            return Result.success({ discountUsd: 0, redemptions: [] });
        }

        let remainingToCover = Math.round(input.invoiceAmountUsd * 100) / 100;
        const redemptions: ReferralRedemption[] = [];
        let totalDiscount = 0;

        for (const credit of credits) {
            if (remainingToCover <= 0) break;

            const creditRemaining = Number(credit.remaining_usd);
            const take = Math.min(creditRemaining, remainingToCover);
            if (take <= 0) continue;

            const newRemaining = Math.round((creditRemaining - take) * 100) / 100;
            const newStatus: ReferralCreditStatus = newRemaining <= 0 ? "consumed" : "partial";

            // Insertamos la redención
            const { data: redData, error: redErr } = await this.source.instance
                .from("referral_redemptions")
                .insert({
                    credit_id:          credit.id,
                    payment_request_id: input.paymentRequestId,
                    amount_usd:         take,
                })
                .select()
                .single<RawReferralRedemptionRow>();

            if (redErr || !redData) return Result.fail(redErr?.message ?? "Redemption insert failed");

            // Actualizamos el crédito
            const { error: upErr } = await this.source.instance
                .from("referral_credits")
                .update({ remaining_usd: newRemaining, status: newStatus })
                .eq("id", credit.id);

            if (upErr) return Result.fail(upErr.message);

            redemptions.push(normalizeRedemption(redData));
            totalDiscount   += take;
            remainingToCover = Math.round((remainingToCover - take) * 100) / 100;
        }

        return Result.success({
            discountUsd: Math.round(totalDiscount * 100) / 100,
            redemptions,
        });
    }

    async refundCreditsForPayment(paymentRequestId: string): Promise<Result<void>> {
        const { data: redemptions, error: fetchErr } = await this.source.instance
            .from("referral_redemptions")
            .select("id, credit_id, amount_usd")
            .eq("payment_request_id", paymentRequestId);

        if (fetchErr) return Result.fail(fetchErr.message);
        const rows = (redemptions ?? []) as Array<{ id: string; credit_id: string; amount_usd: number }>;
        if (rows.length === 0) return Result.success();

        // Agrupar por credit_id en caso de varias redenciones del mismo crédito
        const deltaByCredit = new Map<string, number>();
        for (const r of rows) {
            deltaByCredit.set(r.credit_id, (deltaByCredit.get(r.credit_id) ?? 0) + Number(r.amount_usd));
        }

        for (const [creditId, delta] of deltaByCredit) {
            const { data: credit, error: cErr } = await this.source.instance
                .from("referral_credits")
                .select("amount_usd, remaining_usd")
                .eq("id", creditId)
                .single<{ amount_usd: number; remaining_usd: number }>();

            if (cErr || !credit) return Result.fail(cErr?.message ?? "Credit not found during refund");

            const restored    = Math.round((Number(credit.remaining_usd) + delta) * 100) / 100;
            const capped      = Math.min(restored, Number(credit.amount_usd));
            const newStatus: ReferralCreditStatus =
                capped >= Number(credit.amount_usd) ? "available" : "partial";

            const { error: upErr } = await this.source.instance
                .from("referral_credits")
                .update({ remaining_usd: capped, status: newStatus })
                .eq("id", creditId);

            if (upErr) return Result.fail(upErr.message);
        }

        const { error: delErr } = await this.source.instance
            .from("referral_redemptions")
            .delete()
            .eq("payment_request_id", paymentRequestId);

        if (delErr) return Result.fail(delErr.message);
        return Result.success();
    }

    async referralCodeLookup(code: string): Promise<Result<ReferralCode | null>> {
        const { data, error } = await this.source.instance
            .from("tenants")
            .select("id, referral_code, referred_by")
            .eq("referral_code", code)
            .maybeSingle<{ id: string; referral_code: string; referred_by: string | null }>();

        if (error) return Result.fail(error.message);
        if (!data) return Result.success(null);

        return Result.success({
            tenantId:   data.id,
            code:       data.referral_code,
            referredBy: data.referred_by,
        });
    }
}
