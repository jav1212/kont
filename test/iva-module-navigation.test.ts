import assert from "node:assert/strict";
import test from "node:test";
import { APP_MODULES, MODULE_SUBNAV, navigationDestinationFor } from "../src/shared/frontend/navigation";

test("IVA aparece como módulo Web con accesos fiscales", () => {
  assert.ok(APP_MODULES.some((module) => module.id === "iva" && module.href === "/fiscal"));
  assert.deepEqual(MODULE_SUBNAV.iva?.map((entry) => entry.href), [
    "/fiscal",
    "/settings/iva",
    "/purchases/iva-ledger",
    "/purchases/iva-matches",
    "/sales/iva-ledger",
    "/purchases/iva-imports",
    "/fiscal/iva-declarations",
  ]);
  assert.equal(navigationDestinationFor("iva", "/fiscal"), "iva.dashboard");
  assert.equal(navigationDestinationFor("iva", "/settings/iva"), "iva.configuration");
  assert.equal(navigationDestinationFor("iva", "/purchases/iva-ledger"), "iva.purchase-ledger");
  assert.equal(navigationDestinationFor("iva", "/purchases/iva-matches"), "iva.purchase-matches");
});
