import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import type { FiscalPersistenceScope } from "@kontave/fiscal/domain";
import { currency, exactDecimal, moneyFromDecimal, subtractMoney, addMoney } from "@kontave/monetary/domain";
import type {
  ConfirmedServiceInvoice,
  ConfirmedServiceInvoiceReader,
  SalesFiscalIssuerIdentity,
  SalesFiscalIssuerReader,
} from "@kontave/sales/application";
import { normalizeCurrencyCode } from "@/src/modules/inventory/shared/currency";
import { SalesFailure } from "@kontave/sales/domain";

type InvoiceRow = {
  id: string; company_id: string; customer_id: string; invoice_number: string;
  invoice_date: string; document_type: string | null; status: string;
  currency_code: string | null; subtotal: number | string; vat_amount: number | string;
  total: number | string; discount_amount: number | string | null;
  discount_currency: string | null; surcharge_amount: number | string | null;
  surcharge_currency: string | null; financial_tax_amount: number | string | null;
};
type InvoiceLineRow = {
  id: string; product_id: string | null; service_tax_code: string | null;
  description: string; quantity: number | string; unit_price: number | string;
  line_total: number | string; discount_amount: number | string | null;
  discount_currency: string | null; surcharge_amount: number | string | null;
  surcharge_currency: string | null;
};
type CustomerRow = { name: string; rif: string; address: string; active: boolean | null };
type CompanyRow = { id: string; name: string; rif: string | null; address: string | null };

const VES = currency("VES", 2);

/** Supabase reader for a confirmed legacy sales invoice and its customer identity. */
export class SupabaseConfirmedServiceInvoiceReader implements ConfirmedServiceInvoiceReader {
  /**
   * Creates a tenant-scoped confirmed invoice reader.
   * @param client - Server-side database client.
   * @param tenantId - Authorized legacy tenant ID.
   * @returns No value; the reader is available on the constructed instance.
   * @throws No expected failure during construction.
   */
  constructor(private readonly client: SupabaseClient, private readonly tenantId: string) {}

  /** {@inheritDoc ConfirmedServiceInvoiceReader.find} */
  async find(scope: FiscalPersistenceScope, invoiceId: string): Promise<ConfirmedServiceInvoice | null> {
    const { data: rawInvoice, error: invoiceError } = await this.client.from("shared_inventory_sales_invoices")
      .select("id,company_id,customer_id,invoice_number,invoice_date,document_type,status,currency_code,subtotal,vat_amount,total,discount_amount,discount_currency,surcharge_amount,surcharge_currency,financial_tax_amount")
      .eq("tenant_id", this.tenantId).eq("company_id", scope.companyId).eq("id", invoiceId).maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!rawInvoice) return null;
    const invoice = rawInvoice as InvoiceRow;
    const currencyCode = normalizeCurrencyCode(invoice.currency_code);
    if (currencyCode !== "VES") throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "The first fiscal draft circuit supports invoices issued in VES only.");
    const [linesResult, customerResult] = await Promise.all([
      this.client.from("shared_inventory_sales_invoice_items").select("id,product_id,service_tax_code,description,quantity,unit_price,line_total,discount_amount,discount_currency,surcharge_amount,surcharge_currency")
        .eq("tenant_id", this.tenantId).eq("invoice_id", invoice.id).order("created_at", { ascending: true }).order("id", { ascending: true }),
      this.client.from("shared_inventory_customers").select("name,rif,address,active")
        .eq("tenant_id", this.tenantId).eq("company_id", invoice.company_id).eq("id", invoice.customer_id).maybeSingle(),
    ]);
    if (linesResult.error) throw linesResult.error;
    if (customerResult.error) throw customerResult.error;
    const customer = customerResult.data as CustomerRow | null;
    const lines = ((linesResult.data ?? []) as InvoiceLineRow[]).map((line) => {
      const grossAmount = money(line.line_total);
      const discountAmount = optionalMoney(line.discount_amount, line.discount_currency);
      const surchargeAmount = optionalMoney(line.surcharge_amount, line.surcharge_currency);
      return {
        id: line.id,
        productId: line.product_id,
        serviceTaxCode: line.service_tax_code,
        description: line.description,
        quantity: exactDecimal(String(line.quantity)),
        unitPrice: money(line.unit_price),
        grossAmount,
        discountAmount,
        surchargeAmount,
        netAmount: addMoney(subtractMoney(grossAmount, discountAmount), surchargeAmount),
      };
    });
    return {
      id: invoice.id,
      companyId: companyId(invoice.company_id),
      customerId: invoice.customer_id,
      invoiceNumber: invoice.invoice_number,
      documentType: invoice.document_type === "nota_entrega" ? "nota_entrega" : "venta",
      status: invoice.status === "confirmada" ? "confirmada" : invoice.status === "anulada" ? "anulada" : "borrador",
      invoiceDate: invoice.invoice_date,
      currencyCode,
      subtotal: money(invoice.subtotal),
      vatAmount: money(invoice.vat_amount),
      total: money(invoice.total),
      documentDiscount: optionalMoney(invoice.discount_amount, invoice.discount_currency),
      documentSurcharge: optionalMoney(invoice.surcharge_amount, invoice.surcharge_currency),
      financialTaxAmount: money(invoice.financial_tax_amount ?? 0),
      customer: customer === null ? null : {
        legalName: customer.name,
        taxIdentifier: customer.rif || null,
        fiscalAddress: customer.address || null,
      },
      lines,
    };
  }
}

/** Supabase reader for the issuer identity stored on the authorized company. */
export class SupabaseSalesFiscalIssuerReader implements SalesFiscalIssuerReader {
  /**
   * Creates a tenant-scoped fiscal issuer reader.
   * @param client - Server-side database client.
   * @param tenantId - Authorized legacy tenant ID.
   * @returns No value; the reader is available on the constructed instance.
   * @throws No expected failure during construction.
   */
  constructor(private readonly client: SupabaseClient, private readonly tenantId: string) {}

  /** {@inheritDoc SalesFiscalIssuerReader.find} */
  async find(scope: FiscalPersistenceScope): Promise<SalesFiscalIssuerIdentity | null> {
    const { data, error } = await this.client.from("shared_companies")
      .select("id,name,rif,address")
      .eq("tenant_id", this.tenantId).eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as CompanyRow;
    return {
      companyId: companyId(row.id),
      jurisdiction: "VE",
      taxIdentifier: row.rif ?? "",
      legalName: row.name,
      fiscalAddress: row.address,
    };
  }
}

function money(value: number | string): ReturnType<typeof moneyFromDecimal> {
  return moneyFromDecimal(String(value), VES);
}

function optionalMoney(value: number | string | null, currencyCode: string | null): ReturnType<typeof moneyFromDecimal> {
  if (value == null || Number(value) === 0) return money("0");
  if (normalizeCurrencyCode(currencyCode) !== "VES") throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Commercial adjustments must be stored in VES for this fiscal draft circuit.");
  return money(value);
}

/**
 * Creates a server-side invoice source reader pair using the shared operational schema.
 * @param configuration - Supabase URL and server credential.
 * @param tenantId - Tenant already authorized by the API boundary.
 * @returns Invoice source, issuer reader, and database client for fiscal persistence.
 * @throws When Supabase client configuration is invalid.
 */
export function createSupabaseSalesFiscalReaders(configuration: {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly tenantId: string;
}): {
  readonly client: SupabaseClient;
  readonly invoices: SupabaseConfirmedServiceInvoiceReader;
  readonly issuers: SupabaseSalesFiscalIssuerReader;
} {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    client,
    invoices: new SupabaseConfirmedServiceInvoiceReader(client, configuration.tenantId),
    issuers: new SupabaseSalesFiscalIssuerReader(client, configuration.tenantId),
  };
}
