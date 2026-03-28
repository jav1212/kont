// SupabaseBillingRepository — Supabase implementation of IBillingRepository.
// Role: infrastructure — all Supabase queries for billing data live here; no business logic.
// Invariant: uses service-role client (ServerSupabaseSource); all tenant scoping is by explicit userId/tenantId parameter.

import { Result } from "@/src/core/domain/result";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { IBillingRepository, CreatePaymentRequestInput } from "../../domain/billing-repository";
import { Tenant, Plan, PlanWithModule, PaymentRequest } from "../../domain/tenant";
import { Subscription, SubscriptionProduct, SubscriptionPlan } from "../../domain/subscription";
import { TenantCapacity } from "../../domain/capacity";

// Raw DB row shapes — never exported beyond this file.
interface RawTenantRow {
    id:                   string;
    status:               string;
    schema_name:          string;
    billing_cycle:        string;
    current_period_start: string | null;
    current_period_end:   string | null;
    last_payment_at:      string | null;
    created_at:           string;
    plans:                RawPlanRow | RawPlanRow[] | null;
}

interface RawPlanRow {
    id:                        string;
    name:                      string;
    max_companies:             number | null;
    max_employees_per_company: number | null;
    price_monthly_usd:         number;
    price_quarterly_usd:       number;
    price_annual_usd:          number;
}

interface RawPlanWithProductRow extends RawPlanRow {
    products: { slug: string } | { slug: string }[] | null;
}

interface RawSubscriptionRow {
    id:                   string;
    status:               string;
    billing_cycle:        string;
    current_period_start: string | null;
    current_period_end:   string | null;
    last_payment_at:      string | null;
    products: { id: string; slug: string; name: string; description: string | null } |
              { id: string; slug: string; name: string; description: string | null }[] | null;
    plans: {
        id: string; name: string;
        price_monthly_usd: number; price_quarterly_usd: number; price_annual_usd: number;
        max_companies: number | null; max_employees_per_company: number | null;
    } | {
        id: string; name: string;
        price_monthly_usd: number; price_quarterly_usd: number; price_annual_usd: number;
        max_companies: number | null; max_employees_per_company: number | null;
    }[] | null;
}

interface RawPaymentRequestRow {
    id:             string;
    tenant_id:      string;
    plan_id:        string;
    billing_cycle:  string;
    amount_usd:     number;
    payment_method: string;
    receipt_url:    string | null;
    status:         string;
    notes:          string | null;
    submitted_at:   string;
    reviewed_at:    string | null;
}

interface RawPlanLimitsRow {
    max_companies:              number | null;
    max_employees_per_company:  number | null;
}

function normalizePlan(raw: RawPlanRow): Plan {
    return {
        id:                     raw.id,
        name:                   raw.name,
        maxCompanies:           raw.max_companies,
        maxEmployeesPerCompany: raw.max_employees_per_company,
        priceMonthlyUsd:        raw.price_monthly_usd,
        priceQuarterlyUsd:      raw.price_quarterly_usd,
        priceAnnualUsd:         raw.price_annual_usd,
    };
}

function normalizeSubscriptionProduct(
    raw: RawSubscriptionRow["products"]
): SubscriptionProduct | null {
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (!item) return null;
    return { id: item.id, slug: item.slug, name: item.name, description: item.description };
}

function normalizeSubscriptionPlan(
    raw: RawSubscriptionRow["plans"]
): SubscriptionPlan | null {
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (!item) return null;
    return {
        id:                     item.id,
        name:                   item.name,
        priceMonthlyUsd:        item.price_monthly_usd,
        priceQuarterlyUsd:      item.price_quarterly_usd,
        priceAnnualUsd:         item.price_annual_usd,
        maxCompanies:           item.max_companies,
        maxEmployeesPerCompany: item.max_employees_per_company,
    };
}

function normalizePaymentRequest(raw: RawPaymentRequestRow): PaymentRequest {
    return {
        id:            raw.id,
        tenantId:      raw.tenant_id,
        planId:        raw.plan_id,
        billingCycle:  raw.billing_cycle as PaymentRequest["billingCycle"],
        amountUsd:     raw.amount_usd,
        paymentMethod: raw.payment_method as PaymentRequest["paymentMethod"],
        receiptUrl:    raw.receipt_url,
        status:        raw.status as PaymentRequest["status"],
        notes:         raw.notes,
        submittedAt:   raw.submitted_at,
        reviewedAt:    raw.reviewed_at,
    };
}

export class SupabaseBillingRepository implements IBillingRepository {
    constructor(private readonly source: ServerSupabaseSource) {}

    async getTenant(userId: string): Promise<Result<Tenant>> {
        const { data, error } = await this.source.instance
            .from("tenants")
            .select(`
                id, status, schema_name, billing_cycle,
                current_period_start, current_period_end, last_payment_at, created_at,
                plans ( id, name, max_companies, max_employees_per_company,
                        price_monthly_usd, price_quarterly_usd, price_annual_usd )
            `)
            .eq("id", userId)
            .single();

        if (error || !data) return Result.fail("Tenant not found");

        const raw  = data as unknown as RawTenantRow;
        const plan = Array.isArray(raw.plans) ? raw.plans[0] : raw.plans;

        if (!plan) return Result.fail("Plan not found");

        return Result.success({
            id:                 raw.id,
            status:             raw.status as Tenant["status"],
            schemaName:         raw.schema_name,
            billingCycle:       raw.billing_cycle as Tenant["billingCycle"],
            currentPeriodStart: raw.current_period_start,
            currentPeriodEnd:   raw.current_period_end,
            lastPaymentAt:      raw.last_payment_at,
            createdAt:          raw.created_at,
            plan:               normalizePlan(plan),
        });
    }

    async getSubscriptions(tenantId: string): Promise<Result<Subscription[]>> {
        const { data, error } = await this.source.instance
            .from("tenant_subscriptions")
            .select(`
                id, status, billing_cycle,
                current_period_start, current_period_end, last_payment_at,
                products ( id, slug, name, description ),
                plans ( id, name, price_monthly_usd, price_quarterly_usd, price_annual_usd,
                        max_companies, max_employees_per_company )
            `)
            .eq("tenant_id", tenantId);

        if (error) return Result.fail(error.message);

        const rows = (data ?? []) as unknown as RawSubscriptionRow[];

        const subscriptions: Subscription[] = rows.map((row) => ({
            id:                 row.id,
            status:             row.status,
            billingCycle:       row.billing_cycle,
            currentPeriodStart: row.current_period_start,
            currentPeriodEnd:   row.current_period_end,
            lastPaymentAt:      row.last_payment_at,
            product:            normalizeSubscriptionProduct(row.products),
            plan:               normalizeSubscriptionPlan(row.plans),
        }));

        return Result.success(subscriptions);
    }

    async getPlans(): Promise<Result<PlanWithModule[]>> {
        const { data, error } = await this.source.instance
            .from("plans")
            .select("*, products(slug)")
            .eq("is_active", true)
            .order("price_monthly_usd", { ascending: true });

        if (error) return Result.fail(error.message);

        const plans: PlanWithModule[] = (data ?? []).map((p) => {
            const raw      = p as unknown as RawPlanWithProductRow;
            const products = raw.products;
            const product  = Array.isArray(products) ? products[0] : products;
            return {
                ...normalizePlan(raw),
                moduleSlug: product?.slug ?? null,
            };
        });

        return Result.success(plans);
    }

    async getCapacity(userId: string): Promise<Result<TenantCapacity>> {
        const [limitsRes, companiesRes] = await Promise.all([
            this.source.instance.rpc("tenant_get_plan_limits", { p_user_id: userId }),
            this.source.instance.rpc("tenant_companies_get_all",  { p_user_id: userId }),
        ]);

        if (limitsRes.error)    return Result.fail(limitsRes.error.message);
        if (companiesRes.error) return Result.fail(companiesRes.error.message);

        const limits    = ((limitsRes.data as RawPlanLimitsRow[] | null)?.[0]) ?? { max_companies: null, max_employees_per_company: null };
        const companies = (companiesRes.data as { id: string }[] | null) ?? [];

        const employeesByCompany: Record<string, number> = {};
        for (const co of companies) {
            const { data: empData } = await this.source.instance
                .rpc("tenant_employees_get_by_company", { p_user_id: userId, p_company_id: co.id });
            employeesByCompany[co.id] = (empData as unknown[] | null)?.length ?? 0;
        }

        return Result.success({
            companies: {
                used:      companies.length,
                max:       limits.max_companies,
                remaining: limits.max_companies === null ? null : Math.max(0, limits.max_companies - companies.length),
            },
            employeesPerCompany: {
                max:       limits.max_employees_per_company,
                byCompany: employeesByCompany,
            },
        });
    }

    async getPaymentRequests(tenantId: string): Promise<Result<PaymentRequest[]>> {
        const { data, error } = await this.source.instance
            .from("payment_requests")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("submitted_at", { ascending: false });

        if (error) return Result.fail(error.message);

        return Result.success((data ?? []).map((row) => normalizePaymentRequest(row as unknown as RawPaymentRequestRow)));
    }

    async createPaymentRequest(tenantId: string, input: CreatePaymentRequestInput): Promise<Result<PaymentRequest>> {
        const { data, error } = await this.source.instance
            .from("payment_requests")
            .insert({
                tenant_id:      tenantId,
                plan_id:        input.planId,
                billing_cycle:  input.billingCycle,
                amount_usd:     input.amountUsd,
                payment_method: input.paymentMethod,
                receipt_url:    input.receiptUrl ?? null,
                status:         "pending",
            })
            .select()
            .single();

        if (error) return Result.fail(error.message);

        return Result.success(normalizePaymentRequest(data as unknown as RawPaymentRequestRow));
    }
}
