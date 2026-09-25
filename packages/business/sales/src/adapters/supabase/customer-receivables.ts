import {
  customerReceivableId,
  receivablePaymentId,
  CustomerReceivable,
  type CustomerReceivable,
  type CustomerReceivableState,
  type ReceivablePayment,
} from "../../domain/customer-receivable";
import type { CustomerReceivablesReader, ListCustomerReceivablesQuery, ReceivablePaymentRecorder, RecordReceivablePaymentRequest } from "../../application";
import { customerId } from "../../domain/identifiers";
import { SalesFailure } from "../../domain/sales-failure";
import { salesDate, salesInstant } from "../../domain/temporal";
import { currency, exactDecimal, moneyFromDecimal, moneyToDecimal } from "@kontave/monetary/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";

interface ReceivableRow {
  readonly id: string;
  readonly company_id: string;
  readonly customer_id: string;
  readonly sales_invoice_id: string;
  readonly debt_currency_code: string;
  readonly original_amount: string | number;
  readonly debt_exchange_rate: string | number;
  readonly rate_effective_date: string;
  readonly rate_source: string;
  readonly due_date: string;
  readonly status: string;
  readonly created_at: string;
}

interface PaymentRow {
  readonly id: string;
  readonly receivable_id: string;
  readonly idempotency_key: string;
  readonly received_amount: string | number;
  readonly received_currency_code: string;
  readonly applied_debt_amount: string | number;
  readonly exchange_rate_to_ves: string | number;
  readonly rate_effective_date: string;
  readonly rate_source: string;
  readonly occurred_at: string;
}

/** Adapter for the legacy shared receivable tables used by production Web. */
export class SupabaseCustomerReceivablesAdapter implements CustomerReceivablesReader, ReceivablePaymentRecorder {
  /**
   * Creates a repository over the existing receivable tables and atomic payment RPC.
   * @param client - Supabase client authorized for the requested tenant.
   * @param tenantId - Tenant identifier from authenticated server context.
   */
  constructor(private readonly client: SupabaseClient, private readonly tenantId: string) {}

  /** {@inheritDoc CustomerReceivablesReader.list} */
  async list(query: ListCustomerReceivablesQuery): Promise<readonly CustomerReceivable[]> {
    let accountQuery = this.client.from("shared_sales_receivables").select("*")
      .eq("tenant_id", this.tenantId).eq("company_id", query.companyId).order("due_date");
    if (query.customerId) accountQuery = accountQuery.eq("customer_id", query.customerId);
    const { data: rows, error } = await accountQuery;
    if (error) throw unavailable(error);
    const accounts = (rows ?? []) as unknown as ReceivableRow[];
    const ids = accounts.map((row) => row.id);
    const invoiceIds = accounts.map((row) => row.sales_invoice_id);
    const [paymentResult, invoiceResult] = await Promise.all([
      ids.length ? this.client.from("shared_sales_receivable_payments").select("*").eq("tenant_id", this.tenantId).in("receivable_id", ids).order("occurred_at") : Promise.resolve({ data: [], error: null }),
      invoiceIds.length ? this.client.from("shared_inventory_sales_invoices").select("id,invoice_date").eq("tenant_id", this.tenantId).in("id", invoiceIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (paymentResult.error) throw unavailable(paymentResult.error);
    if (invoiceResult.error) throw unavailable(invoiceResult.error);
    const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];
    const invoiceDates = new Map(((invoiceResult.data ?? []) as { id: string; invoice_date: string }[]).map((invoice) => [invoice.id, invoice.invoice_date]));
    return accounts.map((account) => {
      const principalCurrency = currency(account.debt_currency_code, 8);
      const state: CustomerReceivableState = {
        id: customerReceivableId(account.id),
        companyId: companyId(account.company_id),
        customerId: customerId(account.customer_id),
        saleReference: account.sales_invoice_id,
        saleDate: salesDate(invoiceDates.get(account.sales_invoice_id) ?? account.created_at.slice(0, 10)),
        principal: moneyFromDecimal(String(account.original_amount), principalCurrency),
        debtVesRate: {
          currency: principalCurrency,
          vesPerUnit: exactDecimal(String(account.debt_exchange_rate)),
          effectiveDate: salesDate(account.rate_effective_date),
          capturedAt: salesInstant(account.created_at),
          source: account.rate_source,
        },
        dueDate: salesDate(account.due_date),
        payments: payments.filter((payment) => payment.receivable_id === account.id).map((payment) => toDomainPayment(payment, principalCurrency)),
        version: payments.filter((payment) => payment.receivable_id === account.id).length,
      };
      return new CustomerReceivable(state);
    });
  }

  /** {@inheritDoc ReceivablePaymentRecorder.recordAtomically} */
  async recordAtomically(request: RecordReceivablePaymentRequest) {
    const { data: receivableRow, error: lookupError } = await this.client.from("shared_sales_receivables").select("*")
      .eq("tenant_id", this.tenantId).eq("id", request.receivableId).maybeSingle();
    if (lookupError) throw unavailable(lookupError);
    if (!receivableRow) throw new SalesFailure("SALES_NOT_FOUND", "Customer receivable does not exist.");
    const account = receivableRow as unknown as ReceivableRow;
    const current = (await this.list({ companyId: account.company_id })).find((item) => item.id === request.receivableId);
    if (!current) throw new SalesFailure("SALES_NOT_FOUND", "Customer receivable does not exist.");
    const expected = current.recordPayment(request.payment);
    const { error } = await this.client.rpc("shared_sales_receivable_apply_payment", {
      p_tenant_id: this.tenantId,
      p_receivable_id: request.receivableId,
      p_idempotency_key: request.payment.idempotencyKey,
      p_received_amount: moneyToDecimal(request.payment.receivedAmount),
      p_received_currency_code: request.payment.receivedAmount.currency.code,
      p_exchange_rate_to_ves: String(request.payment.receivedVesRate.vesPerUnit),
      p_rate_effective_date: request.payment.receivedVesRate.effectiveDate,
      p_rate_source: request.payment.receivedVesRate.source,
      p_payment_method: null,
      p_reference: null,
    });
    if (error) throw mapPaymentError(error);
    const refreshed = (await this.list({ companyId: account.company_id })).find((item) => item.id === request.receivableId);
    const payment = refreshed?.payments.find((entry) => entry.idempotencyKey === request.payment.idempotencyKey);
    if (!refreshed || !payment) throw unavailable(new Error("Payment was not visible after the atomic commit."));
    return { receivable: refreshed, payment, replayed: expected.replayed };
  }
}

/**
 * Creates the sales receivable reader and payment recorder for an authenticated tenant.
 * @param client - Supabase client.
 * @param tenantId - Authenticated tenant identifier.
 * @returns Adapter implementing package receivable ports.
 */
export function createSupabaseCustomerReceivablesAdapter(client: SupabaseClient, tenantId: string): SupabaseCustomerReceivablesAdapter {
  return new SupabaseCustomerReceivablesAdapter(client, tenantId);
}

function toDomainPayment(row: PaymentRow, debtCurrency: ReturnType<typeof currency>): ReceivablePayment {
  const receivedCurrency = currency(row.received_currency_code, 8);
  return {
    id: receivablePaymentId(row.id),
    idempotencyKey: row.idempotency_key,
    receivedAmount: moneyFromDecimal(String(row.received_amount), receivedCurrency),
    receivedVesRate: {
      currency: receivedCurrency,
      vesPerUnit: exactDecimal(String(row.exchange_rate_to_ves)),
      effectiveDate: salesDate(row.rate_effective_date),
      capturedAt: salesInstant(row.occurred_at),
      source: row.rate_source,
    },
    appliedDebtAmount: moneyFromDecimal(String(row.applied_debt_amount), debtCurrency),
    occurredAt: salesInstant(row.occurred_at),
  };
}

function unavailable(cause: unknown): SalesFailure {
  return new SalesFailure("SALES_REPOSITORY_UNAVAILABLE", "Customer receivables are unavailable.", { cause });
}

function mapPaymentError(cause: { readonly message: string }): SalesFailure {
  if (cause.message.includes("exceeds")) return new SalesFailure("SALES_RECEIVABLE_PAYMENT_EXCEEDS_BALANCE", "Payment exceeds the remaining receivable balance.", { cause });
  if (cause.message.includes("not found")) return new SalesFailure("SALES_NOT_FOUND", "Open customer receivable does not exist.", { cause });
  return unavailable(cause);
}
