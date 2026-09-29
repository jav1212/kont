import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseFederatedSignIn } from "../../src/adapters/supabase";

test("Azure federation forwards the trusted callback as a Supabase OAuth option", async () => {
  let request: unknown;
  const client = {
    auth: {
      signInWithOAuth: async (value: unknown) => {
        request = value;
        return {
          data: { url: "https://azure.example.test/authorize" },
          error: null,
        };
      },
    },
  };
  const result = await new SupabaseFederatedSignIn(client as never).startSignIn(
    { provider: "azure", redirectTo: "https://app.example.test/auth/callback" },
  );
  assert.deepEqual(request, {
    provider: "azure",
    options: { redirectTo: "https://app.example.test/auth/callback", scopes: "email", skipBrowserRedirect: true },
  });
  assert.equal(result.redirectUrl, "https://azure.example.test/authorize");
});
