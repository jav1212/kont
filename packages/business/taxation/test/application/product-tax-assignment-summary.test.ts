import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { SummarizeProductTaxAssignments, type ProductTaxAssignmentSummary } from "../../src/application";
import { SupabaseProductTaxAssignmentSummaryReader } from "../../src/adapters/supabase";
import { taxationDate, TaxationFailure } from "../../src/domain";

const context = { actorUserId: userId("00000000-0000-4000-8000-000000000003"), organizationId: organizationId("00000000-0000-4000-8000-000000000002"), companyId: companyId("J-12345678-9") };
const on = taxationDate("2026-10-23");
const valid = { on: "2026-10-23", activeProducts: 5, unassigned: 2, legacyMismatch: 1, groups: [{ treatment: "exempt", category: null, products: 2 }, { treatment: "taxed", category: "general", products: 1 }] };

test("adapter scopes the RPC by tenant and actor and decodes the counts", async () => {
  let args: Record<string, unknown> | undefined;
  const reader = new SupabaseProductTaxAssignmentSummaryReader({ async rpc(_name: string, next: Record<string, unknown>) { args = next; return { data: valid, error: null }; } } as never, "tenant-1");
  const summary = await new SummarizeProductTaxAssignments(reader).execute(context, on);
  assert.deepEqual([args?.p_tenant_id, args?.p_actor_id, args?.p_on], ["tenant-1", context.actorUserId, "2026-10-23"]);
  assert.equal(summary.groups[1]?.category, "general");
});

test("access failures and malformed or inconsistent counts are typed", async () => {
  const denied = new SupabaseProductTaxAssignmentSummaryReader({ async rpc() { return { data: null, error: { message: "ORGANIZATIONAL_USER_ACCESS_DENIED" } }; } } as never, "tenant-1");
  await assert.rejects(denied.summarize(context, on), (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_ACCESS_DENIED");
  const malformed = new SupabaseProductTaxAssignmentSummaryReader({ async rpc() { return { data: { ...valid, groups: [{ treatment: "unknown", category: null, products: 1 }] }, error: null }; } } as never, "tenant-1");
  await assert.rejects(malformed.summarize(context, on), (error: unknown) => error instanceof TaxationFailure && error.code === "TAXATION_REPOSITORY_UNAVAILABLE");
  const inconsistent = { async summarize(): Promise<ProductTaxAssignmentSummary> { return { ...valid, on, activeProducts: 9 } as ProductTaxAssignmentSummary; } };
  await assert.rejects(new SummarizeProductTaxAssignments(inconsistent).execute(context, on), /inconsistent/);
});
