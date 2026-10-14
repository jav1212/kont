import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { fiscalInvoiceFixture } from "@kontave/fiscal/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fiscalDocumentTaxFact } from "@kontave/tax-reporting/fiscal-document-mapper";
import { UnitOfMeasure } from "@kontave/products/domain";
import { goodsReceiptLineId, purchaseQuantity, supplierId, supplierInvoiceMatchId, SupplierInvoiceMatch } from "../../../src/domain";
import { SupabaseSupplierInvoiceMatchRepository } from "../../../src/adapters/supabase/supplier-invoice-match";

test("draft save and match confirmation call scoped RPCs, with match and IVA fact in one call", async () => {
  const draftDocument = fiscalInvoiceFixture({ companyId: companyId("company-1"), direction: "received" });
  const document = draftDocument.registerReceived({
    number: "SUPPLIER-INV-1", issuedAt: "2026-09-02T10:00:00.000Z", issueDate: "2026-09-02",
    evidence: { provider: "supplier-document", externalDocumentNumber: "SUPPLIER-INV-1", authorization: null, deviceRegistration: null },
  });
  const match = new SupplierInvoiceMatch({
    id: supplierInvoiceMatchId("match-1"), companyId: document.companyId, supplierId: supplierId("supplier-1"),
    fiscalDocumentId: document.id, documentCurrency: document.documentCurrency,
    allocations: [{ fiscalLineId: document.lines[0]!.id, orderLineId: null, receiptLineId: goodsReceiptLineId("receipt-line-1"), invoicedQuantity: purchaseQuantity("1", UnitOfMeasure.Each), netAmount: document.lines[0]!.netAmount }],
    allocatedNetAmount: document.totals.netAmount, status: "draft", confirmedAt: null, version: 0,
  });
  const scope = { tenantId: "tenant-1", organizationId: "organization-1", companyId: document.companyId };
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return {
        data: {
          match_snapshot: args.p_match_snapshot ?? encode(match),
          fact_snapshot: args.p_fact_snapshot ?? null,
          replayed: false,
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  const repository = new SupabaseSupplierInvoiceMatchRepository(client);
  await repository.saveDraft(scope, match, "00000000-0000-4000-8000-000000000001");

  const fact = fiscalDocumentTaxFact(document, scope, {
    factId: "fact-1", lineageKey: "fiscal-document:SUPPLIER-INV-1", recognitionDate: "2026-09-02",
    counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-03T12:00:00.000Z",
  });
  await repository.commitInvoiceMatch(match.confirm("2026-09-03T12:00:00.000Z"), fact, "00000000-0000-4000-8000-000000000001", "supplier-invoice-match:match-1:v1");

  assert.deepEqual(calls.map((call) => call.name), [
    "shared_supplier_invoice_match_save_draft",
    "shared_supplier_invoice_match_confirm_with_tax_fact",
  ]);
  assert.equal(calls[0]!.args.p_company_id, document.companyId);
  assert.equal(calls[1]!.args.p_match_snapshot && (calls[1]!.args.p_match_snapshot as { status: string }).status, "confirmed");
  assert.equal(calls[1]!.args.p_fact_snapshot && (calls[1]!.args.p_fact_snapshot as { direction: string }).direction, "purchase");
  assert.equal(calls[1]!.args.p_idempotency_key, "supplier-invoice-match:match-1:v1");
}
);

function encode(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, nested: unknown) => typeof nested === "bigint" ? nested.toString() : nested));
}
