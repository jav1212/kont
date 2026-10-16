import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { currency, exactDecimal, moneyFromDecimal } from "@kontave/monetary/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { taxDecision } from "@kontave/taxation/domain";
import type { ResolveProductVenezuelanVat, ResolveServiceVenezuelanVat } from "@kontave/taxation/application";
import { VENEZUELAN_IVA } from "@kontave/taxation/venezuela";
import type { ConfirmedServiceInvoice } from "../../src/application";
import { ConfirmedServiceInvoiceVatAdapter, SalesInvoiceLineVatAdapter } from "../../src/adapters/taxation";

const VES = currency("VES", 2);
const serviceDecision = taxDecision({
  taxCode: VENEZUELAN_IVA,
  treatment: "taxed",
  calculationMode: "tax_exclusive",
  rate: exactDecimal("16"),
  taxableBase: moneyFromDecimal("100", VES),
  amount: moneyFromDecimal("16", VES),
  jurisdiction: "VE",
  ruleVersion: "class-v1|rule-v1",
  legalBasis: "Service classification; legal rate",
  source: { kind: "line", reference: "line-1" },
  category: "general",
  component: "base",
});

function invoice(): ConfirmedServiceInvoice {
  const zero = moneyFromDecimal("0", VES);
  return {
    id: "invoice-1",
    companyId: companyId("company-1"),
    customerId: "customer-1",
    invoiceNumber: "F-1",
    documentType: "venta",
    status: "confirmada",
    invoiceDate: "2026-08-13",
    currencyCode: "VES",
    subtotal: moneyFromDecimal("100", VES),
    vatAmount: moneyFromDecimal("16", VES),
    total: moneyFromDecimal("116", VES),
    documentDiscount: zero,
    documentSurcharge: zero,
    financialTaxAmount: zero,
    customer: null,
    lines: [{
      id: "line-1", productId: null, serviceTaxCode: "CONSULTING", description: "Consulting",
      quantity: exactDecimal("1"), grossAmount: moneyFromDecimal("100", VES), unitPrice: moneyFromDecimal("100", VES),
      discountAmount: zero, surchargeAmount: zero, netAmount: moneyFromDecimal("100", VES),
    }],
  };
}

test("maps package taxation decisions and classification provenance into the confirmed fiscal line", async () => {
  let receivedInput: Record<string, unknown> | undefined;
  const taxation = {
    execute: async (input: Record<string, unknown>) => {
      receivedInput = input;
      return {
        unitCode: "HUR",
        classificationVersion: "classification-v4",
        classificationLegalBasis: "Service legal classification",
        determinations: [serviceDecision],
      };
    },
  } as unknown as ResolveServiceVenezuelanVat;
  const adapter = new ConfirmedServiceInvoiceVatAdapter(taxation, {
    actorUserId: userId("user-1"),
    organizationId: organizationId("organization-1"),
    companyId: companyId("company-1"),
  });

  const resolved = await adapter.resolveLine(invoice(), 0);

  assert.equal(receivedInput?.serviceCode, "CONSULTING");
  assert.equal(receivedInput?.operationDate, "2026-08-13");
  assert.equal(resolved.unitCode, "HUR");
  assert.equal(resolved.determinations.length, 1);
  assert.equal(resolved.determinations[0]?.operationDate, "2026-08-13");
  assert.equal(resolved.determinations[0]?.classificationVersion, "classification-v4");
  assert.equal(resolved.determinations[0]?.classificationLegalBasis, "Service legal classification");
  assert.equal(resolved.determinations[0]?.source.kind, "line");
});

test("rejects a service line without an explicit classification code before invoking taxation", async () => {
  let called = false;
  const taxation = { execute: async () => { called = true; throw new Error("must not run"); } } as unknown as ResolveServiceVenezuelanVat;
  const adapter = new ConfirmedServiceInvoiceVatAdapter(taxation, {
    actorUserId: userId("user-1"),
    organizationId: organizationId("organization-1"),
    companyId: companyId("company-1"),
  });
  const source = invoice();
  const unclassified = { ...source, lines: [{ ...source.lines[0]!, serviceTaxCode: null }] };
  await assert.rejects(adapter.resolveLine(unclassified, 0), { code: "SALES_FISCAL_TAX_UNRESOLVED" });
  assert.equal(called, false);
});

test("resolves product lines through the versioned product use case and preserves product units", async () => {
  let receivedInput: Record<string, unknown> | undefined;
  const products = {
    executeWithClassification: async (input: Record<string, unknown>) => {
      receivedInput = input;
      return {
        classificationVersion: "product-class-v2",
        classificationLegalBasis: "Product classification evidence",
        determinations: [serviceDecision],
      };
    },
  } as unknown as ResolveProductVenezuelanVat;
  const services = { execute: async () => { throw new Error("Service resolver must not run."); } } as unknown as ResolveServiceVenezuelanVat;
  const adapter = new SalesInvoiceLineVatAdapter(products, services, {
    actorUserId: userId("user-1"),
    organizationId: organizationId("organization-1"),
    companyId: companyId("company-1"),
  });
  const source = invoice();
  const productInvoice = {
    ...source,
    lines: [{ ...source.lines[0]!, productId: "product-1", productUnitCode: "kilogram", serviceTaxCode: null }],
  };

  const resolved = await adapter.resolveLine(productInvoice, 0);

  assert.equal(receivedInput?.requireCompanyCatalog, true);
  assert.equal(receivedInput?.lineReference, "line-1");
  assert.equal(resolved.unitCode, "kilogram");
  assert.equal(resolved.determinations[0]?.classificationVersion, "product-class-v2");
  assert.equal(resolved.determinations[0]?.classificationLegalBasis, "Product classification evidence");
});
