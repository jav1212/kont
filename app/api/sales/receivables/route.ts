import { ListCustomerReceivables, RecordCustomerReceivablePayment } from "@kontave/sales/application";
import { createSupabaseCustomerReceivablesAdapter } from "@kontave/sales/supabase";
import { customerReceivableId, receivablePaymentId, SalesFailure } from "@kontave/sales/domain";
import { currency, exactDecimal, moneyFromDecimal, moneyToDecimal } from "@kontave/monetary/domain";
import { companyId as toCompanyId } from "@kontave/companies/domain";
import { salesDate, salesInstant } from "@kontave/sales/domain";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";

const currencyScale = 8;
const rateSources = ["bcv", "manual", "legacy", "identity"] as const;

/** Lists customer receivables and their immutable payment history for one company. */
export const GET = withTenantPermission("sales.read", async (req, { tenantId }) => {
  const companyId = new URL(req.url).searchParams.get("companyId");
  if (!companyId) return Response.json({ error: "companyId es requerido" }, { status: 400 });
  const db = new ServerSupabaseSource().instance;
  try {
    const records = await new ListCustomerReceivables(createSupabaseCustomerReceivablesAdapter(db, tenantId))
      .execute({ companyId: toCompanyId(companyId) });
    const invoiceIds = records.map((record) => record.saleReference);
    const customerIds = [...new Set(records.map((record) => record.customerId))];
    const [invoicesResult, customersResult] = await Promise.all([
      invoiceIds.length ? db.from("shared_inventory_sales_invoices").select("id,invoice_number,invoice_date").eq("tenant_id", tenantId).in("id", invoiceIds) : Promise.resolve({ data: [], error: null }),
      customerIds.length ? db.from("shared_inventory_customers").select("id,name,rif").eq("tenant_id", tenantId).in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (invoicesResult.error || customersResult.error) throw invoicesResult.error ?? customersResult.error;
    const accounts = records.map((record) => ({
      id: record.id,
      company_id: record.companyId,
      customer_id: record.customerId,
      sales_invoice_id: record.saleReference,
      debt_currency_code: record.principal.currency.code,
      original_amount: moneyToDecimal(record.principal),
      debt_exchange_rate: String(record.debtVesRate.vesPerUnit),
      due_date: record.dueDate,
      status: record.balance.minorAmount === 0n ? "settled" : "open",
    }));
    const payments = records.flatMap((record) => record.payments.map((payment) => ({
      id: payment.id,
      receivable_id: record.id,
      applied_debt_amount: moneyToDecimal(payment.appliedDebtAmount),
      occurred_at: payment.occurredAt,
      received_amount: moneyToDecimal(payment.receivedAmount),
      received_currency_code: payment.receivedAmount.currency.code,
      exchange_rate_to_ves: String(payment.receivedVesRate.vesPerUnit),
      rate_effective_date: payment.receivedVesRate.effectiveDate,
      rate_source: payment.receivedVesRate.source,
    })));
    return Response.json({ data: { accounts, payments, invoices: invoicesResult.data ?? [], customers: customersResult.data ?? [] } });
  } catch (error) {
    return failureResponse(error);
  }
});

/** Applies a payment through the package domain and its atomic Supabase adapter. */
export const POST = withTenantPermission("sales.create", async (req, { tenantId }) => {
  try {
    const body = await req.json() as Record<string, unknown>;
    const amount = decimalInput(body.receivedAmount);
    const rate = decimalInput(body.exchangeRateToVes);
    const code = typeof body.receivedCurrencyCode === "string" ? body.receivedCurrencyCode.toUpperCase() : "";
    if (typeof body.receivableId !== "string" || typeof body.idempotencyKey !== "string"
      || typeof body.rateEffectiveDate !== "string" || !/^[A-Z]{3}$/.test(code)
      || typeof body.rateSource !== "string" || !rateSources.includes(body.rateSource as typeof rateSources[number])) {
      return Response.json({ error: "Los datos del abono no son válidos" }, { status: 400 });
    }
    const receivedCurrency = currency(code, currencyScale);
    const receivedAmount = moneyFromDecimal(amount, receivedCurrency);
    const paymentRate = exactDecimal(rate);
    const now = new Date().toISOString();
    const adapter = createSupabaseCustomerReceivablesAdapter(new ServerSupabaseSource().instance, tenantId);
    const result = await new RecordCustomerReceivablePayment(adapter).execute({
      receivableId: customerReceivableId(body.receivableId),
      payment: {
        id: receivablePaymentId(crypto.randomUUID()),
        idempotencyKey: body.idempotencyKey,
        receivedAmount,
        receivedVesRate: {
          currency: receivedCurrency,
          vesPerUnit: paymentRate,
          effectiveDate: salesDate(body.rateEffectiveDate),
          capturedAt: salesInstant(now),
          source: body.rateSource,
        },
        occurredAt: salesInstant(now),
      },
    });
    return Response.json({ data: { payment: result.payment, replayed: result.replayed } });
  } catch (error) {
    return failureResponse(error);
  }
});

function decimalInput(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new SalesFailure("SALES_RECEIVABLE_PAYMENT_INVALID", "Payment amount and exchange rate must be decimal values.");
}

function failureResponse(error: unknown): Response {
  if (error instanceof SalesFailure) {
    const status = error.code === "SALES_NOT_FOUND" ? 404
      : error.code === "SALES_REPOSITORY_UNAVAILABLE" ? 500 : 400;
    return Response.json({ error: error.message, code: error.code }, { status });
  }
  return Response.json({ error: "No se pudo procesar la cuenta por cobrar" }, { status: 500 });
}
