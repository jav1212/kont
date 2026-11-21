import { decimalToFixed, exactDecimal } from "@kontave/monetary/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  DEFAULT_FINANCED_SALES_LEDGER_SETTINGS,
  type FinancedSaleRecord,
  type FinancedSalesLedgerRepository,
  type FinancedSalesLedgerSettings,
  type FinancedSalesLedgerState,
  type FinancierDepositRecord,
} from "../../application";
import { SalesFailure } from "../../domain/sales-failure";
import { salesDate } from "../../domain/temporal";

const decimal = z.union([z.string(), z.number()]).transform((value) => exactDecimal(String(value)));
const accountRoles = z.enum(["bank", "financier_receivable", "sales", "exchange_gain", "exchange_loss", "financier_commission"]);
const settingsRow = z.object({
  financier_name: z.string(),
  upfront_percent: decimal,
  commission_percent: decimal,
  journal_granularity: z.enum(["daily", "monthly"]),
  // Absent before migration 20261121170000; the setting then stays disabled.
  revalue_month_end: z.boolean().optional().default(false),
  accounts: z.record(z.string(), z.string()).transform((accounts) => Object.fromEntries(Object.entries(accounts).filter(([role]) => accountRoles.safeParse(role).success))),
  version: z.number().int().positive(),
});
const saleRow = z.object({
  id: z.string(),
  sale_date: z.string(),
  amount_ves: decimal,
  upfront_percent: decimal,
  ves_per_usd: decimal,
  rate_source: z.enum(["bcv", "manual"]),
  note: z.string().nullable(),
});
const depositRow = z.object({
  id: z.string(),
  deposit_date: z.string(),
  amount_ves: decimal,
  ves_per_usd: decimal,
  rate_source: z.enum(["bcv", "manual"]),
  commission_percent: decimal,
  reference: z.string().nullable(),
  bank_entry_id: z.string().nullable().optional().default(null),
});

/** Ledger repository over the `shared_financed_*` tables of the Web database. */
export class SupabaseFinancedSalesLedgerRepository implements FinancedSalesLedgerRepository {
  /**
   * Creates the repository.
   * @param client - Service-role client; callers must authorize the tenant and company first.
   * @param tenantId - Tenant from the authenticated server context.
   * @param actorId - User recorded as creator of new rows, when known.
   */
  constructor(private readonly client: SupabaseClient, private readonly tenantId: string, private readonly actorId: string | null) {}

  /** {@inheritDoc FinancedSalesLedgerRepository.load} */
  async load(companyId: string): Promise<FinancedSalesLedgerState> {
    const [settings, sales, deposits] = await Promise.all([
      this.client.from("shared_financed_sales_settings").select("*").eq("tenant_id", this.tenantId).eq("company_id", companyId).maybeSingle(),
      this.client.from("shared_financed_sales").select("*").eq("tenant_id", this.tenantId).eq("company_id", companyId).order("sale_date").order("created_at"),
      this.client.from("shared_financier_deposits").select("*").eq("tenant_id", this.tenantId).eq("company_id", companyId).order("deposit_date").order("created_at"),
    ]);
    if (settings.error) throw unavailable(settings.error);
    if (sales.error) throw unavailable(sales.error);
    if (deposits.error) throw unavailable(deposits.error);
    return {
      settings: settings.data ? toSettings(parse(settingsRow, settings.data)) : DEFAULT_FINANCED_SALES_LEDGER_SETTINGS,
      sales: parse(saleRow.array(), sales.data ?? []).map((row): FinancedSaleRecord => ({
        id: row.id,
        saleDate: salesDate(row.sale_date),
        amountVes: row.amount_ves,
        upfrontPercent: row.upfront_percent,
        vesPerUsd: row.ves_per_usd,
        rateSource: row.rate_source,
        note: row.note,
      })),
      deposits: parse(depositRow.array(), deposits.data ?? []).map((row): FinancierDepositRecord => ({
        id: row.id,
        depositDate: salesDate(row.deposit_date),
        amountVes: row.amount_ves,
        vesPerUsd: row.ves_per_usd,
        rateSource: row.rate_source,
        commissionPercent: row.commission_percent,
        reference: row.reference,
        bankEntryId: row.bank_entry_id,
      })),
    };
  }

  /** {@inheritDoc FinancedSalesLedgerRepository.saveSettings} */
  async saveSettings(companyId: string, settings: FinancedSalesLedgerSettings, expectedVersion: number): Promise<FinancedSalesLedgerSettings> {
    const { data, error } = await this.client.rpc("shared_financed_sales_settings_save", {
      p_tenant_id: this.tenantId,
      p_company_id: companyId,
      p_expected_version: expectedVersion,
      p_settings: {
        financier_name: settings.financierName,
        upfront_percent: settings.upfrontPercent,
        commission_percent: settings.commissionPercent,
        journal_granularity: settings.journalGranularity,
        revalue_month_end: settings.revalueMonthEnd,
        accounts: settings.accounts,
      },
    });
    if (error) {
      if (error.message.includes("SALES_CONCURRENCY_CONFLICT")) throw new SalesFailure("SALES_CONCURRENCY_CONFLICT", "Financed sales settings changed meanwhile.");
      if (error.message.includes("SALES_NOT_FOUND")) throw new SalesFailure("SALES_NOT_FOUND", "Company does not exist.");
      throw unavailable(error);
    }
    return toSettings(parse(settingsRow, data));
  }

  /** {@inheritDoc FinancedSalesLedgerRepository.addSales} */
  async addSales(companyId: string, sales: readonly FinancedSaleRecord[]): Promise<void> {
    // A single multi-row insert is one statement, so the batch is atomic.
    const { error } = await this.client.from("shared_financed_sales").insert(sales.map((sale) => ({
      tenant_id: this.tenantId,
      id: sale.id,
      company_id: companyId,
      sale_date: sale.saleDate,
      amount_ves: decimalToFixed(sale.amountVes, 2),
      upfront_percent: sale.upfrontPercent,
      ves_per_usd: sale.vesPerUsd,
      rate_source: sale.rateSource,
      note: sale.note,
      created_by: this.actorId,
    })));
    if (error) throw unavailable(error);
  }

  /** {@inheritDoc FinancedSalesLedgerRepository.addDeposits} */
  async addDeposits(companyId: string, deposits: readonly FinancierDepositRecord[]): Promise<void> {
    const { error } = await this.client.from("shared_financier_deposits").insert(deposits.map((deposit) => ({
      tenant_id: this.tenantId,
      id: deposit.id,
      company_id: companyId,
      deposit_date: deposit.depositDate,
      amount_ves: decimalToFixed(deposit.amountVes, 2),
      ves_per_usd: deposit.vesPerUsd,
      rate_source: deposit.rateSource,
      commission_percent: deposit.commissionPercent,
      reference: deposit.reference,
      ...(deposit.bankEntryId ? { bank_entry_id: deposit.bankEntryId } : {}),
      created_by: this.actorId,
    })));
    if (error) throw unavailable(error);
  }

  /** {@inheritDoc FinancedSalesLedgerRepository.updateSale} */
  async updateSale(companyId: string, sale: FinancedSaleRecord): Promise<void> {
    const { data, error } = await this.client.from("shared_financed_sales").update({
      sale_date: sale.saleDate,
      amount_ves: decimalToFixed(sale.amountVes, 2),
      upfront_percent: sale.upfrontPercent,
      ves_per_usd: sale.vesPerUsd,
      rate_source: sale.rateSource,
      note: sale.note,
    }).eq("tenant_id", this.tenantId).eq("company_id", companyId).eq("id", sale.id).select("id");
    if (error) throw unavailable(error);
    if (!data?.length) throw new SalesFailure("SALES_NOT_FOUND", "Financed sale does not exist.");
  }

  /** {@inheritDoc FinancedSalesLedgerRepository.updateDeposit} */
  async updateDeposit(companyId: string, deposit: FinancierDepositRecord): Promise<void> {
    // The bank link is owned by setBankLinks and deliberately left untouched here.
    const { data, error } = await this.client.from("shared_financier_deposits").update({
      deposit_date: deposit.depositDate,
      amount_ves: decimalToFixed(deposit.amountVes, 2),
      ves_per_usd: deposit.vesPerUsd,
      rate_source: deposit.rateSource,
      commission_percent: deposit.commissionPercent,
      reference: deposit.reference,
    }).eq("tenant_id", this.tenantId).eq("company_id", companyId).eq("id", deposit.id).select("id");
    if (error) throw unavailable(error);
    if (!data?.length) throw new SalesFailure("SALES_NOT_FOUND", "Financier deposit does not exist.");
  }

  /** {@inheritDoc FinancedSalesLedgerRepository.remove} */
  async remove(companyId: string, kind: "sale" | "deposit", id: string): Promise<void> {
    const table = kind === "sale" ? "shared_financed_sales" : "shared_financier_deposits";
    const { error } = await this.client.from(table).delete().eq("tenant_id", this.tenantId).eq("company_id", companyId).eq("id", id);
    if (error) throw unavailable(error);
  }

  /** {@inheritDoc FinancedSalesLedgerRepository.setBankLinks} */
  async setBankLinks(companyId: string, links: readonly { readonly depositId: string; readonly bankEntryId: string | null }[]): Promise<void> {
    const { error } = await this.client.rpc("shared_financier_deposits_set_bank_links", {
      p_tenant_id: this.tenantId,
      p_company_id: companyId,
      p_links: links.map((link) => ({ deposit_id: link.depositId, bank_entry_id: link.bankEntryId })),
    });
    if (!error) return;
    if (error.message.includes("SALES_CONCURRENCY_CONFLICT")) throw new SalesFailure("SALES_CONCURRENCY_CONFLICT", "A bank movement is already linked to another deposit.");
    if (error.message.includes("SALES_FINANCED_COLLECTION_INVALID")) throw new SalesFailure("SALES_FINANCED_COLLECTION_INVALID", "A deposit to link does not exist.");
    throw unavailable(error);
  }
}

function toSettings(row: z.infer<typeof settingsRow>): FinancedSalesLedgerSettings {
  return {
    financierName: row.financier_name,
    upfrontPercent: row.upfront_percent,
    commissionPercent: row.commission_percent,
    journalGranularity: row.journal_granularity,
    revalueMonthEnd: row.revalue_month_end,
    accounts: row.accounts,
    version: row.version,
  };
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new SalesFailure("SALES_REPOSITORY_UNAVAILABLE", "Financed sales ledger returned invalid data.", { cause: result.error });
  return result.data;
}

function unavailable(cause: unknown): SalesFailure {
  return new SalesFailure("SALES_REPOSITORY_UNAVAILABLE", "Financed sales ledger is unavailable.", { cause });
}
