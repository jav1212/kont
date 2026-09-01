import assert from "node:assert/strict";
import test from "node:test";
import { workspaceFailureMessage } from "./desktop-workspace-controller";

test("workspace failure feedback never returns a remote diagnostic", () => {
  const failure = {
    code: "WORKSPACE_REFRESH_FAILED",
    message: "remote response included a bearer token",
  } as never;
  assert.equal(
    workspaceFailureMessage(failure),
    "No se pudo actualizar el espacio de trabajo. Intenta nuevamente.",
  );
});
