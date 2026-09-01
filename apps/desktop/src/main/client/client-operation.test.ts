import assert from "node:assert/strict";
import test from "node:test";
import { publicFailureMessage } from "./client-operation";

test("maps remote failures to safe public feedback", () => {
  assert.equal(
    publicFailureMessage("PRODUCT_ACCESS_DENIED"),
    "No tienes permisos para completar esta operación.",
  );
  assert.equal(
    publicFailureMessage("REMOTE_DATABASE_TIMEOUT"),
    "No se pudo completar la operación. Intenta nuevamente.",
  );
});
