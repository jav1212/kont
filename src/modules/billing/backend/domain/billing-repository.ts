// IBillingRepository — port contract for all billing data access.
// Role: domain boundary — infrastructure must implement this; application depends only on this interface.
// Invariant: all methods return Result<T>; callers never interact with Supabase directly.

import { Result } from "@/src/core/domain/result";
import { Tenant, PaymentRequest, PlanWithModule, BillingCycle, PaymentMethod } from "./tenant";
import { Subscription } from "./subscription";
import { TenantCapacity } from "./capacity";

export interface CreatePaymentRequestInput {
    planId:        string;
    billingCycle:  BillingCycle;
    amountUsd:     number;
    paymentMethod: PaymentMethod;
    receiptUrl:    string | null;
    discountUsd?:  number;
}

export interface ApproveAndActivateInput {
    planId:       string;
    billingCycle: BillingCycle;
    discountUsd:  number;
}

export interface IBillingRepository {
    getTenant(userId: string): Promise<Result<Tenant>>;
    getSubscriptions(tenantId: string): Promise<Result<Subscription[]>>;
    getPlans(): Promise<Result<PlanWithModule[]>>;
    getCapacity(userId: string): Promise<Result<TenantCapacity>>;
    getPaymentRequests(tenantId: string): Promise<Result<PaymentRequest[]>>;
    createPaymentRequest(tenantId: string, input: CreatePaymentRequestInput): Promise<Result<PaymentRequest>>;

    // Auto-aprobación: inserta un payment_request approved con amount_usd=0 y
    // payment_method='credit', y activa al tenant con el período calculado.
    approveAndActivate(tenantId: string, input: ApproveAndActivateInput): Promise<Result<PaymentRequest>>;
}
