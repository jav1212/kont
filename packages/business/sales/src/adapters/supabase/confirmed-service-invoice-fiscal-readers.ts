import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import type { FiscalPersistenceScope } from "@kontave/fiscal/domain";
import { addMoney, compareDecimal, currency, exactDecimal, moneyFromDecimal, subtractMoney } from "@kontave/monetary/domain";
import type {
  ConfirmedServiceInvoice,
  ConfirmedServiceInvoiceReader,
  SalesFiscalIssuerIdentity,
  SalesFiscalIssuerReader,
} from "../../application";
import { SalesFailure } from "../../domain";

interface InvoiceRow {
  readonly id: string;
  readonly company_id: string;
  readonly customer_id: string;
  readonly invoice_number: string;
  readonly updated_at: string;
  readonly invoice_date: string;
  readonly document_type: string | null;
  readonly status: string;
  readonly currency_code: string | null;
  readonly subtotal: number | string;
  readonly vat_amount: number | string;
  readonly total: number | string;
  readonly discount_amount: number | string | null;
  readonly discount_currency: string | null;
  readonly surcharge_amount: number | string | null;
  readonly surcharge_currency: string | null;
  readonly financial_tax_amount: number | string | null;
}

interface InvoiceLineRow {
  readonly id: string;
  readonly product_id: string | null;
  readonly service_tax_code: string | null;
  readonly description: string;
  readonly quantity: number | string;
  readonly unit_price: number | string;
  readonly line_total: number | string;
  readonly discount_amount: number | string | null;
  readonly discount_currency: string | null;
  readonly surcharge_amount: number | string | null;
  readonly surcharge_currency: string | null;
}
interface ProductUnitRow { readonly id: string; readonly measure_unit: string | null; }

interface CustomerRow {
  readonly name: string;
  readonly rif: string;
  readonly address: string;
  readonly active: boolean | null;
}

interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly rif: string | null;
  readonly address: string | null;
}

const VES = currency("VES", 2);

/** Reads a confirmed invoice and its immutable lines from the legacy sales schema. */
export class SupabaseConfirmedServiceInvoiceReader implements ConfirmedServiceInvoiceReader {
  /**
   * Creates an invoice reader bound to one authenticated tenant.
   * @param client - Server-side Supabase client.
   * @param tenantId - Tenant already authorized by the API boundary.
   * @returns No value; the reader is available on the constructed instance.
   * @throws No expected failure during construction.
   */
  constructor(private readonly client: SupabaseClient, private readonly tenantId: string) {}

  /** {@inheritDoc ConfirmedServiceInvoiceReader.find} */
  async find(scope: FiscalPersistenceScope, invoiceId: string): Promise<ConfirmedServiceInvoice | null> {
    const { data: rawInvoice, error: invoiceError } = await this.client.from("shared_inventory_sales_invoices")
      .select("id,company_id,customer_id,invoice_number,invoice_date,updated_at,document_type,status,currency_code,subtotal,vat_amount,total,discount_amount,discount_currency,surcharge_amount,surcharge_currency,financial_tax_amount")
      .eq("tenant_id", this.tenantId).eq("company_id", scope.companyId).eq("id", invoiceId).maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!rawInvoice) return null;
    const invoice = rawInvoice as InvoiceRow;
    if (normalizeCurrency(invoice.currency_code) !== "VES") {
      throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "The first fiscal draft circuit supports invoices issued in VES only.");
    }
    const [linesResult, customerResult] = await Promise.all([
      this.client.from("shared_inventory_sales_invoice_items")
        .select("id,product_id,service_tax_code,description,quantity,unit_price,line_total,discount_amount,discount_currency,surcharge_amount,surcharge_currency")
        .eq("tenant_id", this.tenantId).eq("invoice_id", invoice.id).order("created_at", { ascending: true }).order("id", { ascending: true }),
      this.client.from("shared_inventory_customers").select("name,rif,address,active")
        .eq("tenant_id", this.tenantId).eq("company_id", invoice.company_id).eq("id", invoice.customer_id).maybeSingle(),
    ]);
    if (linesResult.error) throw linesResult.error;
    if (customerResult.error) throw customerResult.error;
    const customer = customerResult.data as CustomerRow | null;
    const sourceLines = (linesResult.data ?? []) as InvoiceLineRow[];
    const productIds = [...new Set(sourceLines.flatMap((line) => line.product_id ? [line.product_id] : []))];
    const productUnitsResult = productIds.length === 0
      ? { data: [], error: null }
      : await this.client.from("shared_inventory_products").select("id,measure_unit")
        .eq("tenant_id", this.tenantId).eq("company_id", invoice.company_id).in("id", productIds);
    if (productUnitsResult.error) throw productUnitsResult.error;
    const productUnits = new Map(((productUnitsResult.data ?? []) as ProductUnitRow[])
      .map((row) => [row.id, fiscalUnitCode(row.measure_unit)]));
    const lines = sourceLines.map((line) => {
      const grossAmount = fromVes(line.line_total);
      const discountAmount = optionalVes(line.discount_amount, line.discount_currency);
      const surchargeAmount = optionalVes(line.surcharge_amount, line.surcharge_currency);
      return {
        id: line.id,
        productId: line.product_id,
        productUnitCode: line.product_id === null ? null : productUnits.get(line.product_id) ?? null,
        serviceTaxCode: line.service_tax_code,
        description: line.description,
        quantity: exactDecimal(String(line.quantity)),
        unitPrice: fromVes(line.unit_price),
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
      sourceUpdatedAt: invoice.updated_at,
      currencyCode: "VES",
      subtotal: fromVes(invoice.subtotal),
      vatAmount: fromVes(invoice.vat_amount),
      total: fromVes(invoice.total),
      documentDiscount: optionalVes(invoice.discount_amount, invoice.discount_currency),
      documentSurcharge: optionalVes(invoice.surcharge_amount, invoice.surcharge_currency),
      financialTaxAmount: fromVes(invoice.financial_tax_amount ?? 0),
      customer: customer === null ? null : {
        legalName: customer.name,
        taxIdentifier: customer.rif || null,
        fiscalAddress: customer.address || null,
      },
      lines,
    };
  }
}

/** Reads the authorized company's current fiscal identity for an invoice snapshot. */
export class SupabaseSalesFiscalIssuerReader implements SalesFiscalIssuerReader {
  /**
   * Creates an issuer reader bound to one authorized tenant.
   * @param client - Server-side Supabase client.
   * @param tenantId - Tenant already authorized by the API boundary.
   * @returns No value; the reader is available on the constructed instance.
   * @throws No expected failure during construction.
   */
  constructor(private readonly client: SupabaseClient, private readonly tenantId: string) {}

  /** {@inheritDoc SalesFiscalIssuerReader.find} */
  async find(scope: FiscalPersistenceScope): Promise<SalesFiscalIssuerIdentity | null> {
    const { data, error } = await this.client.from("shared_companies").select("id,name,rif,address")
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

/**
 * Creates the fiscal source readers and shared server-side client for a tenant.
 * @param configuration - Supabase endpoint, server credential and authorized tenant.
 * @returns Invoice reader, issuer reader and persistence client.
 * @throws When the client cannot be constructed from the supplied configuration.
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

function fromVes(value: number | string): ReturnType<typeof moneyFromDecimal> {
  return moneyFromDecimal(String(value), VES);
}

function optionalVes(value: number | string | null, currencyCode: string | null): ReturnType<typeof moneyFromDecimal> {
  if (value == null || compareDecimal(exactDecimal(String(value)), exactDecimal("0")) === 0) return fromVes("0");
  if (normalizeCurrency(currencyCode) !== "VES") {
    throw new SalesFailure("SALES_FISCAL_PREPARATION_INVALID", "Commercial adjustments must be stored in VES for this fiscal draft circuit.");
  }
  return fromVes(value);
}

function fiscalUnitCode(value: string | null): string | null {
  if (!value) return null;
  const units: Readonly<Record<string, string>> = {
    unidad: "each", kg: "kilogram", g: "gram", m: "meter", m2: "square_meter",
    m3: "cubic_meter", litro: "liter", galon: "gallon", caja: "box", rollo: "roll", paquete: "package",
  };
  return units[value.trim().toLowerCase()] ?? null;
}

function normalizeCurrency(value: string | null): string {
  return (value ?? "VES").trim().toUpperCase();
}
