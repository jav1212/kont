import assert from "node:assert/strict";
import test from "node:test";
import { currency } from "@kontave/monetary/domain";
import {
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import { createWebOperationContext } from "../src/modules/workspace/frontend/web-operation-context";
import type { OrganizationWorkspace } from "../src/modules/organizations/contracts";

const organization: OrganizationWorkspace = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Scope",
  slug: "scope",
  logoUrl: null,
  version: 1,
  role: "owner",
  permissions: ["*"],
  legacyTenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const company = {
  id: "J-SCOPE",
  name: "Scope company",
  ownerId: organization.legacyTenantId,
};
const key = {
  userId: userId(organization.legacyTenantId),
  organizationId: organizationId(organization.id),
  companyId: companyId(company.id),
};
const defaults = {
  effectiveDate: "2026-09-12",
  presentationCurrency: "VES",
  exchangeRate: { status: "unavailable", effectiveDate: "2026-09-12" },
  version: 4,
  updatedAt: "2026-09-12T12:00:00Z",
};

test("operational adapter uses cookie Web routes, explicit tenant and versioned manual-rate commands", async () => {
  const commands: unknown[] = [];
  const coordinator = createWebOperationContext(
    organization,
    company,
    new AbortController().signal,
    async (input, init) => {
      assert.match(String(input), /^\/api\/organizations\//);
      assert.doesNotMatch(String(input), /\/client\/v1\//);
      assert.equal(
        new Headers(init?.headers).get("X-Tenant-Id"),
        organization.legacyTenantId,
      );
      assert.equal(new Headers(init?.headers).has("Authorization"), false);
      if (init?.method === "PATCH") {
        commands.push(JSON.parse(String(init.body)));
        return Response.json({ data: { ...defaults, version: 5 } });
      }
      return Response.json({ data: defaults });
    },
  );
  await coordinator.initialize(key);
  assert.equal(coordinator.getState().status, "ready");
  await coordinator.selectManualExchangeRate({
    baseCurrency: currency("USD", 2),
    value: "42.10",
    reason: "Cotización acordada",
  });
  assert.deepEqual(commands, [
    {
      expectedVersion: 4,
      effectiveDate: "2026-09-12",
      presentationCurrency: "VES",
      manualExchangeRate: {
        baseCurrency: "USD",
        value: "42.1",
        reason: "Cotización acordada",
      },
    },
  ]);
});

test("operational adapter retains a recoverable version conflict instead of silently overwriting", async () => {
  const coordinator = createWebOperationContext(
    organization,
    company,
    new AbortController().signal,
    async (_input, init) =>
      init?.method === "PATCH"
        ? Response.json({ error: "changed" }, { status: 409 })
        : Response.json({ data: defaults }),
  );
  await coordinator.initialize(key);
  await assert.rejects(
    coordinator.selectManualExchangeRate({
      baseCurrency: currency("USD", 2),
      value: "42.10",
      reason: "Cotización acordada",
    }),
  );
  const state = coordinator.getState();
  assert.equal(state.status, "failed");
  if (state.status === "failed")
    assert.equal(state.failure.code, "OPERATION_CONTEXT_VERSION_CONFLICT");
});
