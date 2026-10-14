import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { fiscalInvoiceFixture } from "@kontave/fiscal/testing";
import { fiscalDocumentLineId } from "@kontave/fiscal/domain";
import { UnitOfMeasure } from "@kontave/products/domain";
import { supplierId, supplierInvoiceMatchId, goodsReceiptLineId, purchaseQuantity } from "../../src/domain";
import { Supplier, SupplierInvoiceMatch } from "../../src/domain";
import { ConfirmSupplierInvoiceMatch, type FiscalDocumentReader, type SupplierIdentityReader, type SupplierInvoiceMatchCommitPort, type SupplierInvoiceMatchRepository } from "../../src/application";

test("invoice match commits its received fiscal fact atomically with review status for deductibility", async () => {
  const draft = fiscalInvoiceFixture({ companyId: companyId("company-1"), direction: "received" });
  const document = draft.registerReceived({
    number: "SUPPLIER-INV-1",
    issuedAt: "2026-09-02T10:00:00.000Z",
    issueDate: "2026-09-02",
    evidence: { provider: "supplier-document", externalDocumentNumber: "SUPPLIER-INV-1", authorization: null, deviceRegistration: null },
  });
  const supplier = new Supplier({
    id: supplierId("supplier-1"), companyId: document.companyId, legalName: document.issuer.legalName,
    tradeName: null, taxIdentifier: document.issuer.taxIdentifier, status: "active", version: 1,
  });
  const match = new SupplierInvoiceMatch({
    id: supplierInvoiceMatchId("match-1"), companyId: document.companyId, supplierId: supplier.id,
    fiscalDocumentId: document.id, documentCurrency: document.documentCurrency,
    allocations: [{ fiscalLineId: document.lines[0]!.id, orderLineId: null, receiptLineId: goodsReceiptLineId("receipt-line-1"), invoicedQuantity: purchaseQuantity("1", UnitOfMeasure.Each), netAmount: document.totals.netAmount }],
    allocatedNetAmount: document.totals.netAmount, status: "draft", confirmedAt: null, version: 0,
  });
  const scope = { tenantId: "tenant-1", organizationId: "organization-1", companyId: document.companyId };
  const matches: SupplierInvoiceMatchRepository = { async find(requestedScope, id) { assert.equal(requestedScope.companyId, document.companyId); return id === match.id ? match : null; } };
  const fiscal: FiscalDocumentReader = { async find(requestedScope, id) { assert.equal(requestedScope.companyId, document.companyId); return id === document.id ? document : null; } };
  const suppliers: SupplierIdentityReader = { async findForInvoiceMatch(_scope, id) { return id === supplier.id ? supplier : null; } };
  let committed: Parameters<SupplierInvoiceMatchCommitPort["commitInvoiceMatch"]> | undefined;
  const commit: SupplierInvoiceMatchCommitPort = {
    async commitInvoiceMatch(...input) { committed = input; },
  };

  let profileLookup: { supplierId: string; effectiveDate: string; actorId: string } | undefined;
  const fiscalProfiles = { async getEffectiveProfile(_scope: typeof scope, id: typeof supplier.id, effectiveDate: string, actorId: string) { profileLookup = { supplierId: id, effectiveDate, actorId }; return null; } };
  const confirmed = await new ConfirmSupplierInvoiceMatch(matches, fiscal, suppliers, fiscalProfiles, commit).execute({
    scope, id: match.id, occurredAt: "2026-09-03T12:00:00.000Z", actorId: "actor-1",
    factMetadata: { factId: "purchase-fact-1", lineageKey: "purchase:supplier-document-1", recognitionDate: "2026-09-02", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-03T12:00:00.000Z" },
  });

  assert.equal(confirmed.status, "confirmed");
  assert.equal(committed?.[1].direction, "purchase");
  assert.equal(committed?.[1].deductible.state, "pending_review");
  assert.equal(committed?.[1].reconciliation.reason?.includes("COUNTERPARTY_FISCAL_PROFILE_REVIEW_REQUIRED"), true);
  assert.deepEqual(profileLookup, { supplierId: "supplier-1", effectiveDate: "2026-09-02", actorId: "actor-1" });
  assert.equal(committed?.[2], "actor-1");
  assert.equal(committed?.[3], "supplier-invoice-match:match-1:v1");
});

test("invoice match refuses a supplier mismatch before the atomic commit", async () => {
  const draft = fiscalInvoiceFixture({ companyId: companyId("company-1"), direction: "received" });
  const document = draft.registerReceived({ number: "SUPPLIER-INV-1", issuedAt: "2026-09-02T10:00:00.000Z", issueDate: "2026-09-02", evidence: { provider: "supplier-document", externalDocumentNumber: "SUPPLIER-INV-1", authorization: null, deviceRegistration: null } });
  const wrongSupplier = new Supplier({ id: supplierId("supplier-1"), companyId: document.companyId, legalName: "Wrong", tradeName: null, taxIdentifier: "J-00000000-0", status: "active", version: 1 });
  const match = new SupplierInvoiceMatch({ id: supplierInvoiceMatchId("match-1"), companyId: document.companyId, supplierId: wrongSupplier.id, fiscalDocumentId: document.id, documentCurrency: document.documentCurrency, allocations: [{ fiscalLineId: document.lines[0]!.id, orderLineId: null, receiptLineId: goodsReceiptLineId("receipt-line-1"), invoicedQuantity: purchaseQuantity("1", UnitOfMeasure.Each), netAmount: document.totals.netAmount }], allocatedNetAmount: document.totals.netAmount, status: "draft", confirmedAt: null, version: 0 });
  const scope = { tenantId: "tenant-1", organizationId: "organization-1", companyId: document.companyId };
  const commit: SupplierInvoiceMatchCommitPort = { async commitInvoiceMatch() { assert.fail("must not commit mismatched supplier"); } };
  const useCase = new ConfirmSupplierInvoiceMatch(
    { async find() { return match; } }, { async find() { return document; } }, { async findForInvoiceMatch() { return wrongSupplier; } }, { async getEffectiveProfile() { assert.fail("must not look up profile for mismatched supplier"); } }, commit,
  );
  await assert.rejects(() => useCase.execute({ scope, id: match.id, occurredAt: "2026-09-03T12:00:00.000Z", actorId: "actor-1", factMetadata: { factId: "fact-1", lineageKey: "purchase:1", recognitionDate: "2026-09-02", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-03T12:00:00.000Z" } }));
});

test("invoice match refuses allocations that do not cover the stored fiscal lines", async () => {
  const draft = fiscalInvoiceFixture({ companyId: companyId("company-1"), direction: "received" });
  const document = draft.registerReceived({ number: "SUPPLIER-INV-2", issuedAt: "2026-09-02T10:00:00.000Z", issueDate: "2026-09-02", evidence: { provider: "supplier-document", externalDocumentNumber: "SUPPLIER-INV-2", authorization: null, deviceRegistration: null } });
  const supplier = new Supplier({ id: supplierId("supplier-1"), companyId: document.companyId, legalName: document.issuer.legalName, tradeName: null, taxIdentifier: document.issuer.taxIdentifier, status: "active", version: 1 });
  const match = new SupplierInvoiceMatch({
    id: supplierInvoiceMatchId("match-2"), companyId: document.companyId, supplierId: supplier.id,
    fiscalDocumentId: document.id, documentCurrency: document.documentCurrency,
    allocations: [{ fiscalLineId: fiscalDocumentLineId("unrelated-line"), orderLineId: null, receiptLineId: goodsReceiptLineId("receipt-line-2"), invoicedQuantity: purchaseQuantity("1", UnitOfMeasure.Each), netAmount: document.totals.netAmount }],
    allocatedNetAmount: document.totals.netAmount, status: "draft", confirmedAt: null, version: 0,
  });
  let committed = false;
  const useCase = new ConfirmSupplierInvoiceMatch(
    { async find() { return match; } },
    { async find() { return document; } },
    { async findForInvoiceMatch() { return supplier; } },
    { async getEffectiveProfile() { return null; } },
    { async commitInvoiceMatch() { committed = true; } },
  );
  await assert.rejects(() => useCase.execute({
    scope: { tenantId: "tenant-1", organizationId: "organization-1", companyId: document.companyId },
    id: match.id, occurredAt: "2026-09-03T12:00:00.000Z", actorId: "actor-1",
    factMetadata: { factId: "fact-2", lineageKey: "purchase:2", recognitionDate: "2026-09-02", counterpartyCountryCode: "VE", affectedFactId: null, withholding: null, recordedAt: "2026-09-03T12:00:00.000Z" },
  }));
  assert.equal(committed, false);
});
