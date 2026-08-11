import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationBillingRepository } from "@kontave/billing-application";
import { BillingFailure, limit, money, type BillingAccount, type Invoice, type OrganizationEntitlements, type OrganizationUsage, type PaymentMethod, type Subscription } from "@kontave/billing-domain";
import type { OrganizationId } from "@kontave/organizations-domain";

export interface BillingSupabaseConfiguration { readonly url: string; readonly serviceRoleKey: string }
export function createOrganizationBillingRepository(configuration: BillingSupabaseConfiguration): OrganizationBillingRepository {
  return new SupabaseOrganizationBillingRepository(createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}

class SupabaseOrganizationBillingRepository implements OrganizationBillingRepository {
  constructor(private readonly client: SupabaseClient) {}
  async findAccount(organizationId: OrganizationId): Promise<BillingAccount | null> {
    return this.guard(async () => {
      const { data, error } = await this.client.from("organization_billing_accounts")
        .select("id,organization_id,legal_name,tax_id,billing_email,country_code,currency")
        .eq("organization_id", organizationId).maybeSingle();
      if (error) throw error;
      return data ? {
        id: data.id, organizationId, legalName: data.legal_name, taxId: data.tax_id,
        billingEmail: data.billing_email, countryCode: data.country_code, currency: data.currency,
      } as BillingAccount : null;
    });
  }
  async listSubscriptions(organizationId: OrganizationId): Promise<readonly Subscription[]> {
    return this.guard(async () => {
      const { data, error } = await this.client.from("organization_subscriptions").select(`
        id,organization_id,status,billing_cycle,current_period_start,current_period_end,
        products(slug),plans(id,name)
      `).eq("organization_id", organizationId).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const product = first(row.products as { slug: string } | { slug: string }[] | null);
        const plan = first(row.plans as { id: string; name: string } | { id: string; name: string }[] | null);
        return {
          id: row.id, organizationId, productCode: product?.slug ?? "unknown", planId: plan?.id ?? null,
          planName: plan?.name ?? null, status: row.status, billingCycle: row.billing_cycle,
          currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end,
        } as Subscription;
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
      for (const row of data ?? []) {
        const product = first(row.products as { slug: string } | { slug: string }[] | null);
        const plan = first(row.plans as { max_companies: number | null } | { max_companies: number | null }[] | null);
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
      return (data ?? []).map((row) => ({
        id: row.id, organizationId, number: row.number, status: row.status,
        subtotal: money(BigInt(row.subtotal_minor), row.currency), tax: money(BigInt(row.tax_minor), row.currency),
        total: money(BigInt(row.total_minor), row.currency), issuedAt: row.issued_at, dueAt: row.due_at, paidAt: row.paid_at,
      } as Invoice));
    });
  }
  async listPaymentMethods(organizationId: OrganizationId): Promise<readonly PaymentMethod[]> {
    return this.guard(async () => {
      const { data, error } = await this.client.from("organization_payment_methods")
        .select("id,organization_id,kind,provider,display_label,is_default")
        .eq("organization_id", organizationId).eq("status", "active").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id, organizationId, kind: row.kind, provider: row.provider,
        displayLabel: row.display_label, isDefault: row.is_default,
      } as PaymentMethod));
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
function first<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
function mergeLimits(values: readonly (number | null)[]): number | null {
  if (values.length === 0) return 0;
  if (values.includes(null)) return null;
  return Math.max(...values.filter((value): value is number => value !== null));
}
