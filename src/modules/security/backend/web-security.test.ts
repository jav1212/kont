import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  decodePaymentOrderPage,
  SecurityWebHttpError,
  securityJson,
  securityRouteId,
} from "./web-security";

test("security request payloads reject a forged actor field", async () => {
  const request = new Request("https://kontave.test/api/security/users", {
    method: "POST",
    body: JSON.stringify({
      userId: "b0bbfbb0-aaaa-4ddd-8eee-cccccccccccc",
      actorId: "attacker",
    }),
    headers: { "content-type": "application/json" },
  });
  await assert.rejects(
    securityJson(request, z.object({ userId: z.string().uuid() }).strict()),
    (error: unknown) =>
      error instanceof SecurityWebHttpError && error.status === 400,
  );
});

test("security route IDs accept only UUID user identifiers", () => {
  assert.equal(
    securityRouteId("b0bbfbb0-aaaa-4ddd-8eee-cccccccccccc"),
    "b0bbfbb0-aaaa-4ddd-8eee-cccccccccccc",
  );
  assert.throws(() => securityRouteId("other-user"), SecurityWebHttpError);
});

test("payment-order list rejects a payload whose pagination was altered", () => {
  const page = { orders: [], total: 0, offset: 1, limit: 50 };
  assert.throws(
    () => decodePaymentOrderPage(page, { offset: 0, limit: 50 }),
    SecurityWebHttpError,
  );
});
