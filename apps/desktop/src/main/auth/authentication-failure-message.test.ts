import assert from "node:assert/strict";
import test from "node:test";
import { authenticationFailureMessage } from "./authentication-failure-message";

test("authentication failure feedback never returns remote diagnostic text", () => {
  const remoteDiagnostic = "refresh token leaked from upstream";
  assert.equal(
    authenticationFailureMessage("INVALID_CREDENTIALS"),
    "Las credenciales no son válidas.",
  );
  assert.equal(
    authenticationFailureMessage(remoteDiagnostic),
    "No se pudo completar la autenticación. Intenta nuevamente.",
  );
});
