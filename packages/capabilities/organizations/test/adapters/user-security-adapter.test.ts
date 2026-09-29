import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseOrganizationalUserSecurity } from "../../src/adapters/supabase";
import {
  organizationId,
  userId,
  UserAdministrationFailure,
} from "../../src/domain";

const actor = userId("10000000-0000-4000-8000-000000000001");
const organization = organizationId("20000000-0000-4000-8000-000000000001");
const target = userId("30000000-0000-4000-8000-000000000001");

test("organizational user adapter rejects malformed persisted payloads", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json([
      {
        organization_id: String(organization),
        user_id: String(target),
        email: "invalid",
        display_name: null,
        administrative_priority: 0,
        allowed_company_ids: [],
        status: "active",
        version: 1,
      },
    ]),
  );
  const adapter = createSupabaseOrganizationalUserSecurity(
    { url: "https://security.test", serviceRoleKey: "test-key" },
    actor,
  );
  await assert.rejects(
    () => adapter.repository.list(organization),
    (cause: unknown) =>
      cause instanceof UserAdministrationFailure &&
      cause.code === "ORGANIZATIONAL_USER_DATA_INVALID",
  );
});

test("organizational user adapter rejects a valid row from another organization", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json([
      {
        organization_id: "40000000-0000-4000-8000-000000000001",
        user_id: String(target),
        email: "user@example.test",
        display_name: null,
        administrative_priority: 0,
        allowed_company_ids: [],
        status: "active",
        version: 1,
      },
    ]),
  );
  const adapter = createSupabaseOrganizationalUserSecurity(
    { url: "https://security.test", serviceRoleKey: "test-key" },
    actor,
  );
  await assert.rejects(
    () => adapter.repository.list(organization),
    (cause: unknown) =>
      cause instanceof UserAdministrationFailure &&
      cause.code === "ORGANIZATIONAL_USER_DATA_INVALID",
  );
});

test("organizational user adapter maps compare-and-swap and access denials", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { message: "ORGANIZATIONAL_USER_VERSION_CONFLICT" },
      { status: 400 },
    ),
  );
  const adapter = createSupabaseOrganizationalUserSecurity(
    { url: "https://security.test", serviceRoleKey: "test-key" },
    actor,
  );
  await assert.rejects(
    () => adapter.repository.revoke(target, organization, 1),
    (cause: unknown) =>
      cause instanceof UserAdministrationFailure &&
      cause.code === "ORGANIZATIONAL_USER_VERSION_CONFLICT",
  );
});
