import assert from "node:assert/strict";
import test from "node:test";
import type { ModuleCode } from "@kontave/modules/domain";
import { resolveCompanyProfileLanding } from "../src/modules/workspace/frontend/kiosk-company-landing";

const modules = (...codes: ModuleCode[]) => codes;

test("a kiosk company opens POS for a permitted cashier", () => {
  assert.equal(
    resolveCompanyProfileLanding("kiosk", modules("sales", "purchases", "inventory"), ["sales.read", "sales.create"], true),
    "/sales/pos",
  );
});

test("a kiosk company falls back to the first permitted operational section", () => {
  assert.equal(
    resolveCompanyProfileLanding("kiosk", modules("sales", "purchases", "inventory"), ["purchases.read"], true),
    "/purchases",
  );
});

test("a pending kiosk subscription only directs billing readers to billing", () => {
  assert.equal(
    resolveCompanyProfileLanding("kiosk", modules("sales", "purchases", "inventory"), ["billing.read", "sales.read", "sales.create"], false),
    "/settings/billing",
  );
  assert.equal(
    resolveCompanyProfileLanding("kiosk", modules("sales", "purchases", "inventory"), ["sales.read", "sales.create"], false),
    "/tools",
  );
});

test("switching from kiosk to a standard company resolves its standard landing", () => {
  assert.equal(
    resolveCompanyProfileLanding("standard", modules("payroll", "sales", "inventory"), ["payroll.read", "sales.read", "sales.create"], true),
    "/payroll/tablero",
  );
});

test("switching between kiosk companies keeps the kiosk landing independent of the previous company", () => {
  assert.equal(
    resolveCompanyProfileLanding("kiosk", modules("sales", "inventory"), ["sales.read"], true),
    "/sales/archive",
  );
  assert.equal(
    resolveCompanyProfileLanding("kiosk", modules("sales", "inventory"), ["sales.read", "sales.create"], true),
    "/sales/pos",
  );
});
