import assert from "node:assert/strict";
import { test } from "node:test";
import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId } from "@kontave/organizations/domain";
import {
  IssueSalesDeliveryNoteWithDocumentSeries,
  type IssueSalesDeliveryNoteWithDocumentSeriesCommand,
  type SalesDeliveryNoteDocumentSeriesIssuanceRepository,
} from "../../src/application";
import { SalesFailure } from "../../src/domain";

const organizationId = "8e2403ad-a266-4ffc-8680-b744f241001e" as OrganizationId;
const companyId = "company" as CompanyId;
const branchId = "6be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const seriesId = "7be10ba0-d5d3-4a61-a34f-73d0c81a2345";
const command: IssueSalesDeliveryNoteWithDocumentSeriesCommand = {
  actorUserId: "2e2403ad-a266-4ffc-8680-b744f241001e", organizationId, companyId, deliveryNoteId: "delivery-draft",
  idempotencyKey: "delivery-0001", documentSeriesScope: { kind: "branch", organizationId, companyId, branchId },
  documentSeriesSelection: { kind: "explicit", seriesId }, companyBranchId: branchId, allowNegativeStock: false,
};

test("normalizes a delivery-note issuance without fiscal invoice or tax-fact evidence", async () => {
  let received: IssueSalesDeliveryNoteWithDocumentSeriesCommand | undefined;
  const repository: SalesDeliveryNoteDocumentSeriesIssuanceRepository = {
    async issue(value) {
      received = value;
      return { deliveryNoteId: value.deliveryNoteId, companyId, status: "confirmed", seriesId, displayNumber: "NE-00000001", number: 1, replayed: false };
    },
  };
  const result = await new IssueSalesDeliveryNoteWithDocumentSeries(repository).issue({ ...command, deliveryNoteId: " delivery-draft ", idempotencyKey: " delivery-0001 ", priceListId: " standard " });
  assert.equal(result.displayNumber, "NE-00000001");
  assert.equal(received?.deliveryNoteId, "delivery-draft");
  assert.equal(received?.idempotencyKey, "delivery-0001");
  assert.equal(received?.priceListId, "standard");
  assert.equal("fiscalDocument" in (received ?? {}), false);
  assert.equal("taxFact" in (received ?? {}), false);
});

test("rejects invalid branch scope and mutually-exclusive branch/register attribution before persistence", () => {
  let calls = 0;
  const repository = { async issue() { calls++; throw new Error("must not execute"); } } as unknown as SalesDeliveryNoteDocumentSeriesIssuanceRepository;
  const service = new IssueSalesDeliveryNoteWithDocumentSeries(repository);
  assert.throws(
    () => service.issue({ ...command, companyBranchId: "7a80cb00-d5d3-4a61-a34f-73d0c81a2345" }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_DOCUMENT_SERIES_SELECTION_INVALID",
  );
  assert.throws(
    () => service.issue({ ...command, salesRegisterId: "register", companyBranchId: branchId }),
    (error: unknown) => error instanceof SalesFailure && error.code === "SALES_DOCUMENT_SERIES_INVALID",
  );
  assert.equal(calls, 0);
});

test("rejects malformed idempotency keys and explicit series identifiers before persistence", () => {
  let calls = 0;
  const repository = { async issue() { calls++; throw new Error("must not execute"); } } as unknown as SalesDeliveryNoteDocumentSeriesIssuanceRepository;
  const service = new IssueSalesDeliveryNoteWithDocumentSeries(repository);
  assert.throws(() => service.issue({ ...command, idempotencyKey: "short" }), SalesFailure);
  assert.throws(() => service.issue({ ...command, documentSeriesSelection: { kind: "explicit", seriesId: "not-a-uuid" } }), SalesFailure);
  assert.equal(calls, 0);
});

test("rejects a malformed organization identifier and runtime-null command as typed failures", () => {
  let calls = 0;
  const repository = { async issue() { calls++; throw new Error("must not execute"); } } as unknown as SalesDeliveryNoteDocumentSeriesIssuanceRepository;
  const service = new IssueSalesDeliveryNoteWithDocumentSeries(repository);
  assert.throws(() => service.issue({ ...command, organizationId: "organization" as OrganizationId }), (error: unknown) => error instanceof SalesFailure && error.code === "SALES_DOCUMENT_SERIES_INVALID");
  assert.throws(() => service.issue(null as unknown as IssueSalesDeliveryNoteWithDocumentSeriesCommand), (error: unknown) => error instanceof SalesFailure && error.code === "SALES_DOCUMENT_SERIES_INVALID");
  assert.equal(calls, 0);
});
