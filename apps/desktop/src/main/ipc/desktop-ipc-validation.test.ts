import assert from "node:assert/strict";
import test from "node:test";
import { DESKTOP_IPC } from "../../renderer-bridge";
import {
  DesktopIpcValidationFailure,
  validateDesktopIpcInvocation,
} from "./desktop-ipc-validation";

test("rejects malformed privileged IPC payloads before controllers run", () => {
  assert.throws(
    () =>
      validateDesktopIpcInvocation(DESKTOP_IPC.postInventoryOperation, [
        "organization",
        "company",
        "operation",
        0,
      ]),
    DesktopIpcValidationFailure,
  );
  assert.throws(
    () =>
      validateDesktopIpcInvocation(DESKTOP_IPC.changeSettingsPassword, [
        "short",
        true,
      ]),
    DesktopIpcValidationFailure,
  );
});

test("accepts a bounded product mutation envelope", () => {
  assert.doesNotThrow(() =>
    validateDesktopIpcInvocation(DESKTOP_IPC.createProduct, [
      "organization",
      "company",
      { sku: "SKU-1", name: "Producto", baseUnit: "each" },
    ]),
  );
});

test("rejects extra arguments and validates product reads and navigation", () => {
  assert.throws(
    () => validateDesktopIpcInvocation(DESKTOP_IPC.openExternalDestination, ["help", "extra"]),
    DesktopIpcValidationFailure,
  );
  assert.doesNotThrow(() =>
    validateDesktopIpcInvocation(DESKTOP_IPC.listProducts, [
      "organization", "company", { search: "café", limit: 10 },
    ]),
  );
  assert.doesNotThrow(() =>
    validateDesktopIpcInvocation(DESKTOP_IPC.selectWorkspace, ["workspace"]),
  );
});

test("normalizes privileged command tuples before they reach handlers", () => {
  const args = validateDesktopIpcInvocation(DESKTOP_IPC.createProduct, [
    " organization ", "company", { sku: "SKU", name: "Producto", baseUnit: "each" },
  ]);
  assert.deepEqual(args, [
    "organization", "company", { sku: "SKU", name: "Producto", baseUnit: "each" },
  ]);
  assert.deepEqual(
    validateDesktopIpcInvocation(DESKTOP_IPC.revokeOtherSettingsSessions, []),
    [],
  );
  assert.deepEqual(
    validateDesktopIpcInvocation(DESKTOP_IPC.changeSettingsPassword, [
      "valid-password",
      true,
    ]),
    ["valid-password", true],
  );
  assert.deepEqual(
    validateDesktopIpcInvocation(DESKTOP_IPC.setProductStatus, [
      "organization",
      "company",
      "product",
      true,
      3,
    ]),
    ["organization", "company", "product", true, 3],
  );
  assert.deepEqual(
    validateDesktopIpcInvocation(DESKTOP_IPC.postInventoryOperation, [
      "organization",
      "company",
      "operation",
      2,
    ]),
    ["organization", "company", "operation", 2],
  );
});

test("preserves Desktop dashboard defaults and translates recentLimit through shared decoders", () => {
  assert.deepEqual(
    validateDesktopIpcInvocation(DESKTOP_IPC.getPurchasingDashboard, [
      "organization", "company", { recentLimit: 7 },
    ]),
    ["organization", "company", { recentLimit: 7 }],
  );
  assert.deepEqual(
    validateDesktopIpcInvocation(DESKTOP_IPC.getInventoryDashboard, [
      "organization", "company", {},
    ]),
    ["organization", "company", {}],
  );
  assert.throws(
    () => validateDesktopIpcInvocation(DESKTOP_IPC.getSalesDashboard, [
      "organization", "company", { recentLimit: 0 },
    ]),
    DesktopIpcValidationFailure,
  );
});

test("normalizes authentication and settings scope before controller dispatch", () => {
  assert.deepEqual(
    validateDesktopIpcInvocation(DESKTOP_IPC.signIn, [
      { email: " user@example.com ", password: " secret " },
    ]),
    [{ email: "user@example.com", password: " secret " }],
  );
  assert.deepEqual(
    validateDesktopIpcInvocation(DESKTOP_IPC.getSettingsSnapshot, [
      null,
      " company ",
    ]),
    [null, "company"],
  );
  assert.throws(
    () =>
      validateDesktopIpcInvocation(DESKTOP_IPC.register, [
        { email: "user@example.com", password: "secret", role: "admin" },
      ]),
    DesktopIpcValidationFailure,
  );
});
