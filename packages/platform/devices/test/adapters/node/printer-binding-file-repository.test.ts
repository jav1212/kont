import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";
import { describe, it } from "node:test";
import {
  NodePrinterBindingFileRepository,
  NodePrinterBindingStoreFailure,
} from "@kontave/devices/node";
import { PrinterConfigurationFailure, type PrinterConfigurationScope, type PrinterDeviceReference } from "@kontave/devices/printer-configuration";

const scope: PrinterConfigurationScope = Object.freeze({
  organizationId: "organization-1",
  companyId: "J-12345678-9",
  installationId: "installation-a",
  workstationId: "workstation-a",
});

const otherScope: PrinterConfigurationScope = Object.freeze({ ...scope, workstationId: "workstation-b" });

describe("NodePrinterBindingFileRepository", () => {
  it("persists safe bindings across repository instances with 0600 storage where supported", async () => {
    await withStore(async (storagePath) => {
      const repository = new NodePrinterBindingFileRepository({ storagePath });
      const stored = await repository.replace({ scope, purpose: "receipt", device: device("printer-1"), expectedRevision: null });
      const reopened = new NodePrinterBindingFileRepository({ storagePath });

      assert.deepEqual(await reopened.find(scope, "receipt"), stored);
      if (platform !== "win32") assert.equal((await stat(storagePath)).mode & 0o777, 0o600);
    });
  });

  it("serializes competing compare-and-swap writes across repository instances", async () => {
    await withStore(async (storagePath) => {
      const first = new NodePrinterBindingFileRepository({ storagePath });
      const second = new NodePrinterBindingFileRepository({ storagePath });
      const results = await Promise.allSettled([
        first.replace({ scope, purpose: "receipt", device: device("printer-1"), expectedRevision: null }),
        second.replace({ scope, purpose: "receipt", device: device("printer-2"), expectedRevision: null }),
      ]);

      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      assert.ok(rejected);
      assert.ok(
        rejected.reason instanceof PrinterConfigurationFailure ||
          (rejected.reason instanceof NodePrinterBindingStoreFailure && rejected.reason.code === "PRINTER_BINDING_STORE_LOCK_CONTENDED"),
      );
      assert.equal((await first.find(scope, "receipt"))?.revision, 1);
    });
  });

  it("retains a tombstone so clear and recreate cannot reuse a stale revision", async () => {
    await withStore(async (storagePath) => {
      const repository = new NodePrinterBindingFileRepository({ storagePath });
      const original = await repository.replace({ scope, purpose: "receipt", device: device("printer-1"), expectedRevision: null });
      await repository.clear({ scope, purpose: "receipt", expectedRevision: original.revision });
      const recreated = await new NodePrinterBindingFileRepository({ storagePath }).replace({ scope, purpose: "receipt", device: device("printer-2"), expectedRevision: null });

      assert.equal(recreated.revision, 2);
      await assert.rejects(
        () => repository.clear({ scope, purpose: "receipt", expectedRevision: original.revision }),
        (cause: unknown) => cause instanceof PrinterConfigurationFailure && cause.code === "PRINTER_CONFIGURATION_REVISION_CONFLICT",
      );
    });
  });

  it("rejects a malformed store without overwriting it", async () => {
    await withStore(async (storagePath) => {
      const corrupted = '{"version":1,"bindings":[{"connectionAddress":"COM9"}],"tombstones":[]}';
      await writeFile(storagePath, corrupted, "utf8");
      const repository = new NodePrinterBindingFileRepository({ storagePath });

      await assert.rejects(
        () => repository.find(scope, "receipt"),
        (cause: unknown) => cause instanceof NodePrinterBindingStoreFailure && cause.code === "PRINTER_BINDING_STORE_CORRUPTED",
      );
      await assert.rejects(
        () => repository.replace({ scope, purpose: "receipt", device: device("printer-1"), expectedRevision: null }),
        (cause: unknown) => cause instanceof NodePrinterBindingStoreFailure && cause.code === "PRINTER_BINDING_STORE_CORRUPTED",
      );
      assert.equal(await readFile(storagePath, "utf8"), corrupted);
    });
  });

  it("keeps workstation scopes isolated and never serializes transport addresses", async () => {
    await withStore(async (storagePath) => {
      const repository = new NodePrinterBindingFileRepository({ storagePath });
      const unsafeDevice = { ...device("printer-1"), connectionAddress: "10.0.0.8:9100", port: 9100 };
      await repository.replace({ scope, purpose: "receipt", device: unsafeDevice, expectedRevision: null });
      await repository.replace({ scope: otherScope, purpose: "receipt", device: device("printer-2"), expectedRevision: null });

      const serialized = await readFile(storagePath, "utf8");
      assert.equal(serialized.includes("10.0.0.8:9100"), false);
      assert.equal(serialized.includes("9100"), false);
      assert.equal((await repository.find(otherScope, "receipt"))?.device.id, "printer-2");
      assert.equal((await repository.find(scope, "receipt"))?.device.id, "printer-1");
    });
  });

  it("requires a caller-provided absolute storage path", () => {
    assert.throws(
      () => new NodePrinterBindingFileRepository({ storagePath: "printer-bindings.json" }),
      (cause: unknown) => cause instanceof NodePrinterBindingStoreFailure && cause.code === "PRINTER_BINDING_STORE_INVALID_PATH",
    );
  });

  it("does not remove a pre-existing lock or write behind another process", async () => {
    await withStore(async (storagePath) => {
      const lockPath = `${storagePath}.lock`;
      await writeFile(lockPath, "other-process-token", "utf8");
      const repository = new NodePrinterBindingFileRepository({ storagePath });
      await assert.rejects(
        () => repository.replace({ scope, purpose: "receipt", device: device("printer-1"), expectedRevision: null }),
        (cause: unknown) => cause instanceof NodePrinterBindingStoreFailure && cause.code === "PRINTER_BINDING_STORE_LOCK_CONTENDED",
      );
      assert.equal(await readFile(lockPath, "utf8"), "other-process-token");
      await assert.rejects(readFile(storagePath, "utf8"), { code: "ENOENT" });
    });
  });
});

function device(id: string): PrinterDeviceReference {
  return Object.freeze({
    id,
    category: "receipt-printer" as const,
    manufacturer: "Acme",
    model: "RP-80",
    capabilities: Object.freeze(["receipt.print" as const]),
  });
}

async function withStore(action: (storagePath: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "kontave-printer-bindings-"));
  try {
    await action(join(directory, "bindings.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
