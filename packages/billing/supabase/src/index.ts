import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BillingCreditLedgerRepository, OrganizationBillingRepository, PaymentReceiptStorage } from "@kontave/billing-application";
import { BillingFailure, Currency, limit, money, type BillingAccount, type BillingCreditApplication, type BillingCreditBalance, type BillingPlan, type Invoice, type ManualPaymentRequest, type OrganizationEntitlements, type OrganizationUsage, type PaymentMethod, type PaymentReceiptUpload, type Subscription } from "@kontave/billing-domain";
import type { OrganizationId } from "@kontave/organizations-domain";
import { billingAccountRowSchema, billingCreditApplicationRowSchema, billingPlanRowSchema, entitlementRowSchema, invoiceRowSchema, manualPaymentRequestRowSchema, paymentMethodRowSchema, subscriptionRowSchema } from "./persistence-codecs";

export interface BillingSupabaseConfiguration { readonly url: string; readonly serviceRoleKey: string }
export function createOrganizationBillingRepository(configuration: BillingSupabaseConfiguration): OrganizationBillingRepository {
  return new SupabaseOrganizationBillingRepository(createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}
export function createPaymentReceiptStorage(configuration: BillingSupabaseConfiguration): PaymentReceiptStorage {
  return new SupabasePaymentReceiptStorage(createBillingClient(configuration));
}
export function createBillingCreditLedger(configuration: BillingSupabaseConfiguration): BillingCreditLedgerRepository {
  return new SupabaseBillingCreditLedger(createBillingClient(configuration));
}

function createBillingClient(configuration: BillingSupabaseConfiguration): SupabaseClient {
  return createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

class SupabaseBillingCreditLedger implements BillingCreditLedgerRepository {
  constructor(private readonly client: SupabaseClient) {}
  async getBalance(organizationId: OrganizationId): Promise<BillingCreditBalance> {
    const { data, error } = await this.client.rpc("organization_billing_credit_balance", { p_organization_id: organizationId, p_currency: Currency.Usd });
    if (error) throw new BillingFailure("BILLING_REPOSITORY_UNAVAILABLE", "No se pudo consultar el saldo de créditos.", { cause: error });
    return { organizationId, balance: money(BigInt(data ?? 0), Currency.Usd) };
  }
  async issue(input: Parameters<BillingCreditLedgerRepository["issue"]>[0]): Promise<void> {
    const { error } = await this.client.rpc("issue_organization_billing_credit", {
      p_organization_id: input.organizationId, p_entry_type: input.type,
      p_amount_minor: input.amount.minorAmount.toString(), p_currency: input.amount.currency,
      p_source_type: input.sourceType, p_source_id: input.sourceId,
      p_idempotency_key: input.idempotencyKey, p_occurred_at: input.occurredAt,
    });
    if (error) throw new BillingFailure("BILLING_REPOSITORY_UNAVAILABLE", "No se pudo emitir el crédito.", { cause: error });
  }
  async apply(input: Parameters<BillingCreditLedgerRepository["apply"]>[0]): Promise<BillingCreditApplication> {
    const { data, error } = await this.client.rpc("apply_organization_billing_credit", {
      p_organization_id: input.organizationId, p_invoice_id: input.invoiceId,
      p_amount_minor: input.amount.minorAmount.toString(), p_currency: input.amount.currency,
      p_idempotency_key: input.idempotencyKey, p_occurred_at: input.occurredAt,
    });
    if (error) throw mapCreditError(error);
    const row = billingCreditApplicationRowSchema.parse(data);
    return { id: row.id, organizationId: input.organizationId, invoiceId: input.invoiceId, entryId: row.entry_id, amount: money(BigInt(row.amount_minor), input.amount.currency), appliedAt: row.created_at };
  }
}

function mapCreditError(error: { message?: string }): BillingFailure {
  const message = error.message ?? "";
  if (message.includes("insufficient_credit")) return new BillingFailure("BILLING_CREDIT_INSUFFICIENT", "El saldo de crédito es insuficiente.");
  if (message.includes("currency_mismatch")) return new BillingFailure("BILLING_CURRENCY_MISMATCH", "La moneda del crédito no coincide con la factura.");
  if (message.includes("invoice_not_applicable")) return new BillingFailure("BILLING_INVOICE_NOT_APPLICABLE", "La factura no admite créditos.");
  return new BillingFailure("BILLING_REPOSITORY_UNAVAILABLE", "No se pudo aplicar el crédito.", { cause: error });
}

class SupabaseOrganizationBillingRepository implements OrganizationBillingRepository {
  constructor(private readonly client: SupabaseClient) {}
  async findAccount(organizationId: OrganizationId): Promise<BillingAccount | null> {
    return this.guard(async () => {
      const { data, error } = await this.client.from("organization_billing_accounts")
        .select("id,organization_id,legal_name,tax_id,billing_email,country_code,currency")
        .eq("organization_id", organizationId).maybeSingle();
      if (error) throw error;
      if (!data) return null; const row=billingAccountRowSchema.parse(data);
      return { id: row.id, organizationId, legalName: row.legal_name, taxId: row.tax_id, billingEmail: row.billing_email, countryCode: row.country_code, currency: row.currency };
    });
  }
  async listSubscriptions(organizationId: OrganizationId): Promise<readonly Subscription[]> {
    return this.guard(async () => {
      const { data, error } = await this.client.from("organization_subscriptions").select(`
        id,organization_id,status,billing_cycle,current_period_start,current_period_end,
        products(slug),plans(id,name)
      `).eq("organization_id", organizationId).order("created_at", { ascending: true });
      if (error) throw error;
      return subscriptionRowSchema.array().parse(data ?? []).map((row) => {
        const product = row.products; const plan = row.plans;
        return {
          id: row.id, organizationId, productCode: product?.slug ?? "unknown", planId: plan?.id ?? null,
          planName: plan?.name ?? null, status: row.status, billingCycle: row.billing_cycle,
          currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end,
        };
      });
    });
  }
  async getEntitlements(organizationId: OrganizationId): Promise<OrganizationEntitlements> {
    return this.guard(async () => {
      const { data, error } = await this.client.from("organization_subscriptions").select(`
        status,products(slug),plans(max_companies)
      `).eq("organization_id", organizationId).in("status", ["trial", "active"]);
      if (error) throw error;
      const modules = new Set<string>();
      const limits: Array<number | null> = [];
      for (const row of entitlementRowSchema.array().parse(data ?? [])) {
        const product = row.products; const plan = row.plans;
        if (product?.slug) modules.add(product.slug);
        if (plan) limits.push(plan.max_companies);
      }
      return {
        maxCompanies: mergeLimits(limits), maxMembers: null, maxDevices: null,
        enabledModules: [...modules].sort(),
      };
    });
  }
  async getUsage(organizationId: OrganizationId, entitlements: OrganizationEntitlements): Promise<OrganizationUsage> {
    return this.guard(async () => {
      const [{ count: companies, error: companiesError }, { count: members, error: membersError }] = await Promise.all([
        this.client.from("shared_companies").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        this.client.from("organization_memberships").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
      ]);
      if (companiesError) throw companiesError;
      if (membersError) throw membersError;
      return {
        companies: limit(companies ?? 0, entitlements.maxCompanies),
        members: limit(members ?? 0, entitlements.maxMembers),
        devices: limit(0, entitlements.maxDevices),
      };
    });
  }
  async listInvoices(organizationId: OrganizationId): Promise<readonly Invoice[]> {
    return this.guard(async () => {
      const { data, error } = await this.client.from("organization_invoices")
        .select("id,organization_id,number,status,subtotal_minor,tax_minor,total_minor,currency,issued_at,due_at,paid_at")
        .eq("organization_id", organizationId).order("created_at", { ascending: false });
      if (error) throw error;
      return invoiceRowSchema.array().parse(data ?? []).map((row) => ({
        id: row.id, organizationId, number: row.number, status: row.status,
        subtotal: money(BigInt(row.subtotal_minor), row.currency), tax: money(BigInt(row.tax_minor), row.currency),
        total: money(BigInt(row.total_minor), row.currency), issuedAt: row.issued_at, dueAt: row.due_at, paidAt: row.paid_at,
      }));
    });
  }
  async listPaymentMethods(organizationId: OrganizationId): Promise<readonly PaymentMethod[]> {
    return this.guard(async () => {
      const { data, error } = await this.client.from("organization_payment_methods")
        .select("id,organization_id,kind,provider,display_label,is_default")
        .eq("organization_id", organizationId).eq("status", "active").order("created_at", { ascending: true });
      if (error) throw error;
      return paymentMethodRowSchema.array().parse(data ?? []).map((row) => ({
        id: row.id, organizationId, kind: row.kind, provider: row.provider,
        displayLabel: row.display_label, isDefault: row.is_default,
      }));
    });
  }
  async listPlans(): Promise<readonly BillingPlan[]> {
    return this.guard(async () => {
      const { data, error } = await this.client.from("plans")
        .select("id,name,max_companies,max_employees_per_company,price_monthly_usd,price_quarterly_usd,price_annual_usd,is_contact_only,products(slug)")
        .eq("is_active", true).order("price_monthly_usd", { ascending: true });
      if (error) throw error;
      return billingPlanRowSchema.array().parse(data ?? []).map(mapPlan);
    });
  }
  async listManualPaymentRequests(organizationId: OrganizationId): Promise<readonly ManualPaymentRequest[]> {
    return this.guard(async () => {
      const { data, error } = await this.client.rpc("list_organization_manual_payment_requests", { p_organization_id: organizationId });
      if (error) throw error;
      return manualPaymentRequestRowSchema.array().parse(data ?? []).map(mapManualPaymentRequest);
    });
  }
  async createManualPaymentRequest(input: Parameters<OrganizationBillingRepository["createManualPaymentRequest"]>[0]): Promise<ManualPaymentRequest> {
    return this.guard(async () => {
      const { data, error } = await this.client.rpc("submit_organization_manual_payment_request", {
        p_organization_id: input.organizationId,
        p_plan_id: input.planId,
        p_billing_cycle: input.billingCycle,
        p_payment_method: input.paymentMethod,
        p_receipt_storage_key: input.receiptStorageKey,
      });
      if (error) {
        if (error.message.includes("BILLING_PLAN_NOT_FOUND")) throw new BillingFailure("BILLING_PLAN_NOT_FOUND", "El plan no existe o no está disponible.");
        if (error.message.includes("BILLING_PLAN_CONTACT_REQUIRED")) throw new BillingFailure("BILLING_PLAN_CONTACT_REQUIRED", "Este plan requiere atención comercial.");
        if (error.message.includes("BILLING_RECEIPT_INVALID")) throw new BillingFailure("BILLING_RECEIPT_INVALID", "El comprobante no pertenece a la organización.");
        throw error;
      }
      return mapManualPaymentRequest(manualPaymentRequestRowSchema.parse(data));
    });
  }
  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (cause: unknown) {
      if (cause instanceof BillingFailure) throw cause;
      throw new BillingFailure("BILLING_REPOSITORY_UNAVAILABLE", "No se pudo consultar la facturación.", { cause });
    }
  }
}

class SupabasePaymentReceiptStorage implements PaymentReceiptStorage {
  constructor(private readonly client: SupabaseClient) {}
  async createUpload(input: { readonly organizationId: OrganizationId; readonly fileName: string; readonly contentType: string }): Promise<PaymentReceiptUpload> {
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `${input.organizationId}/${crypto.randomUUID()}/${safeName}`;
    const { data, error } = await this.client.storage.from("billing-payment-receipts").createSignedUploadUrl(storageKey);
    if (error) throw new BillingFailure("BILLING_RECEIPT_UNAVAILABLE", "No se pudo preparar la carga del comprobante.", { cause: error });
    return { uploadUrl: data.signedUrl, storageKey: data.path };
  }
}

function usd(value: string | number) { return money(BigInt(Math.round(Number(value) * 100)), Currency.Usd); }
function mapPlan(row: ReturnType<typeof billingPlanRowSchema.parse>): BillingPlan {
  return { id: row.id, name: row.name, maxCompanies: row.max_companies, maxEmployeesPerCompany: row.max_employees_per_company, monthlyPrice: usd(row.price_monthly_usd), quarterlyPrice: usd(row.price_quarterly_usd), annualPrice: usd(row.price_annual_usd), productCode: row.products?.slug ?? null, contactOnly: row.is_contact_only };
}
function mapManualPaymentRequest(row: ReturnType<typeof manualPaymentRequestRowSchema.parse>): ManualPaymentRequest {
  return { id: row.id, organizationId: row.organization_id as OrganizationId, planId: row.plan_id, billingCycle: row.billing_cycle, amount: usd(row.amount_usd), discount: usd(row.discount_usd), paymentMethod: row.payment_method, receiptStorageKey: row.receipt_storage_key, status: row.status, notes: row.notes, submittedAt: row.submitted_at, reviewedAt: row.reviewed_at };
}
function mergeLimits(values: readonly (number | null)[]): number | null {
  if (values.length === 0) return 0;
  if (values.includes(null)) return null;
  return Math.max(...values.filter((value): value is number => value !== null));
}
