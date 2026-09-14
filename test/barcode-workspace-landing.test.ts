import assert from "node:assert/strict";
import test from "node:test";
import type { ModuleCode } from "@kontave/modules/domain";
import { resolveBarcodeWorkspaceLanding } from "../src/modules/workspace/frontend/barcode-workspace-landing";

const available = (...codes: ModuleCode[]) => codes.map((code) => ({ code }));

test("a cashier badge lands on its committed Sales module", () => {
  assert.equal(
    resolveBarcodeWorkspaceLanding(
      "sales",
      available("sales", "inventory", "tools", "companies"),
      ["companies.read", "inventory.read", "sales.read", "sales.create"],
    ),
    "/sales",
  );
});

test("an owner can land on the committed Payroll module", () => {
  assert.equal(
    resolveBarcodeWorkspaceLanding("payroll", available("payroll", "tools"), ["*"]),
    "/payroll/tablero",
  );
});

test("a landing falls back to Tools when the stored module is absent from the committed workspace", () => {
  assert.equal(
    resolveBarcodeWorkspaceLanding("sales", available("tools"), ["sales.read"]),
    "/tools",
  );
});

test("a landing falls back to Tools when its selected organization no longer grants access", () => {
  assert.equal(
    resolveBarcodeWorkspaceLanding("sales", available("sales"), []),
    "/tools",
  );
});

test("the personal tools fallback remains available to an authenticated badge session", () => {
  assert.equal(
    resolveBarcodeWorkspaceLanding("tools", available("tools"), []),
    "/tools",
  );
});

test("a workspace without any available module stays on Tools", () => {
  assert.equal(resolveBarcodeWorkspaceLanding(null, [], []), "/tools");
});

test("a navigation-only module cannot become a badge destination", () => {
  assert.equal(
    resolveBarcodeWorkspaceLanding("employees" as ModuleCode, available("employees" as ModuleCode), ["*"]),
    "/tools",
  );
});
