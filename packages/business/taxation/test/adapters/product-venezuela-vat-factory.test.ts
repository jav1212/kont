import assert from "node:assert/strict";
import test from "node:test";
import { ResolveProductVenezuelanVat, ResolveServiceVenezuelanVat } from "../../src/application";
import { createSupabaseProductVenezuelanVatResolver, createSupabaseServiceVenezuelanVatResolver } from "../../src/adapters/supabase";

test("Supabase product IVA factory composes profile and company-rule catalog adapters", () => {
  const resolver = createSupabaseProductVenezuelanVatResolver({
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role-test-key",
  });
  assert.ok(resolver instanceof ResolveProductVenezuelanVat);
  const serviceResolver = createSupabaseServiceVenezuelanVatResolver({
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role-test-key",
  });
  assert.ok(serviceResolver instanceof ResolveServiceVenezuelanVat);
});
