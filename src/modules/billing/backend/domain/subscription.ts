// Subscription domain entity for the billing module.
// Role: domain — represents an active or past tenant subscription with its associated product and plan.
// Invariant: product and plan may be null if the subscription is in a degraded state.

export interface SubscriptionProduct {
    id:          string;
    slug:        string;
    name:        string;
    description: string | null;
}

export interface SubscriptionPlan {
    id:                     string;
    name:                   string;
    priceMonthlyUsd:        number;
    priceQuarterlyUsd:      number;
    priceAnnualUsd:         number;
    maxCompanies:           number | null;
    maxEmployeesPerCompany: number | null;
}

export interface Subscription {
    id:                 string;
    status:             string;
    billingCycle:       string;
    currentPeriodStart: string | null;
    currentPeriodEnd:   string | null;
    lastPaymentAt:      string | null;
    product:            SubscriptionProduct | null;
    plan:               SubscriptionPlan | null;
}
