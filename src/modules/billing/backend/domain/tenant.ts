export interface Plan {
    id:                        string;
    name:                      string;
    maxCompanies:              number | null;
    maxEmployeesPerCompany:    number | null;
    priceMonthlyUsd:           number;
    priceQuarterlyUsd:         number;
    priceAnnualUsd:            number;
}

// Plan returned by the public plans listing — includes the associated module slug.
export interface PlanWithModule extends Plan {
    moduleSlug: string | null;
}

export type TenantStatus   = 'trial' | 'active' | 'suspended';
export type BillingCycle   = 'monthly' | 'quarterly' | 'annual';
export type PaymentMethod  = 'transfer' | 'cash';
export type PaymentStatus  = 'pending' | 'approved' | 'rejected';

export interface Tenant {
    id:                 string;
    plan:               Plan;
    status:             TenantStatus;
    schemaName:         string;
    billingCycle:       BillingCycle;
    currentPeriodStart: string | null;
    currentPeriodEnd:   string | null;
    lastPaymentAt:      string | null;
    createdAt:          string;
}

export interface PaymentRequest {
    id:            string;
    tenantId:      string;
    planId:        string;
    billingCycle:  BillingCycle;
    amountUsd:     number;
    paymentMethod: PaymentMethod;
    receiptUrl:    string | null;
    status:        PaymentStatus;
    notes:         string | null;
    submittedAt:   string;
    reviewedAt:    string | null;
}
