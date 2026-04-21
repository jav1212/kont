// IReferralsRepository — puerto de datos del módulo referrals.
// Role: frontera del dominio — toda persistencia Supabase está detrás de esta interfaz.
// Invariant: todos los métodos devuelven Result<T>; los consumidores no tocan Supabase directamente.

import { Result } from "@/src/core/domain/result";
import { ReferralCode } from "./referral-code";
import { ReferralCredit, ReferralRedemption } from "./referral-credit";
import { ReferralStats } from "./referral-stats";

export interface TenantReferralInfo {
    tenantId:      string;
    referralCode:  string;
    referredBy:    string | null;
    lastPaymentAt: string | null;
}

export interface ConsumeCreditsResult {
    discountUsd: number;
    redemptions: ReferralRedemption[];
}

export interface IReferralsRepository {
    // --- Código y vínculo referidor --------------------------------------------
    getTenantReferralInfo(tenantId: string): Promise<Result<TenantReferralInfo>>;
    findTenantIdByReferralCode(code: string): Promise<Result<string | null>>;
    setReferredBy(tenantId: string, referrerTenantId: string): Promise<Result<void>>;

    // --- Stats y créditos ------------------------------------------------------
    getReferralStats(tenantId: string): Promise<Result<ReferralStats>>;
    getAvailableCreditUsd(tenantId: string): Promise<Result<number>>;

    // --- Concesión de crédito --------------------------------------------------
    // Crea un crédito si no existe (UNIQUE(referred_tenant_id) como backstop).
    grantCredit(input: {
        referrerTenantId:       string;
        referredTenantId:       string;
        sourcePaymentRequestId: string;
        amountUsd:              number;
    }): Promise<Result<ReferralCredit | null>>;

    // --- Consumo de crédito ----------------------------------------------------
    consumeCreditsForPayment(input: {
        tenantId:          string;
        paymentRequestId:  string;
        invoiceAmountUsd:  number;
    }): Promise<Result<ConsumeCreditsResult>>;

    // Revierte las redenciones asociadas a un pago (cuando se rechaza o se borra
    // el payment_request). Devuelve los créditos a su estado previo. Idempotente.
    refundCreditsForPayment(paymentRequestId: string): Promise<Result<void>>;

    // Garantiza que el tenant figura en la tabla (lo esperamos siempre true, pero
    // se expone por si hace falta validar desde use cases).
    referralCodeLookup(code: string): Promise<Result<ReferralCode | null>>;
}
