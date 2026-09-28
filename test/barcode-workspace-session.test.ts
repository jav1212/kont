import assert from "node:assert/strict";
import test from "node:test";
import {
  resetWorkspaceSelectionForBarcodeSession,
  resolveBarcodeSessionActor,
} from "@/src/modules/auth/frontend/barcode-workspace-session";

test("a successful badge exchange removes every previous workspace hint", () => {
  const entries = new Map<string, string>([
    ["kont-active-tenant-id", "tenant-old"],
    ["kont-company-id", "company-old"],
    ["kont-active-module", "payroll"],
    ["sidebar-module", "payroll"],
    ["kont-session-user-id", "operator-old"],
    ["unrelated-preference", "preserved"],
  ]);

  resetWorkspaceSelectionForBarcodeSession({
    removeItem: (key: string) => entries.delete(key),
  });

  assert.deepEqual([...entries], [["unrelated-preference", "preserved"]]);
});

test("only a complete server actor can replace the current browser actor", () => {
  assert.deepEqual(
    resolveBarcodeSessionActor({
      data: { user: { id: "operator-new", email: "new@example.test" } },
    }),
    { id: "operator-new", email: "new@example.test" },
  );
  assert.equal(resolveBarcodeSessionActor({ data: { user: { id: "operator-new" } } }), null);
  assert.equal(resolveBarcodeSessionActor({ data: null }), null);
});
