import assert from "node:assert/strict";
import test from "node:test";
import { AuthenticationFailure } from "@kontave/auth";
import {
  applySecureWebSessionCookies,
  evaluateActiveOrganizationPolicies,
} from "./secure-web-sign-in";

test("evaluates every active organization and propagates a denying policy", async () => {
  const evaluated: string[] = [];
  let deferredSessionCleared = 0;

  await assert.rejects(
    () =>
      evaluateActiveOrganizationPolicies(
        ["organization-a", "organization-b"],
        async (organizationId) => {
          evaluated.push(organizationId);
          if (organizationId === "organization-b") {
            deferredSessionCleared += 1;
            throw new AuthenticationFailure(
              "ACCOUNT_SECURITY_DENIED",
              "blocked",
            );
          }
        },
      ),
    { code: "ACCOUNT_SECURITY_DENIED" },
  );

  assert.deepEqual(evaluated, ["organization-a", "organization-b"]);
  assert.equal(deferredSessionCleared, 1);
});

test("allows ordinary onboarding identities with no active organization membership", async () => {
  let evaluations = 0;
  await evaluateActiveOrganizationPolicies([], async () => {
    evaluations += 1;
  });
  assert.equal(evaluations, 0);
});

test("does not publish a deferred session when policy evaluation produced no approved cookies", () => {
  const published: string[] = [];
  applySecureWebSessionCookies(
    {
      cookies: {
        set(name) {
          published.push(name);
        },
      },
    },
    [],
  );
  assert.deepEqual(published, []);
});
