import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeviceDescriptor } from "@kontave/devices/contracts";
import {
  ClearPrinterBinding,
  GetPrinterBinding,
  PrinterConfigurationFailure,
  SetPrinterBinding,
  toCompatibleDeviceReference,
  type ClearPrinterBindingRequest,
  type PrinterBinding,
  type PrinterBindingRepository,
  type PrinterConfigurationAction,
  type PrinterConfigurationAuthorization,
  type PrinterConfigurationScope,
  type PrinterDeviceDiscovery,
  type ReplacePrinterBinding,
} from "@kontave/devices/printer-configuration";

const scope: PrinterConfigurationScope = Object.freeze({
  organizationId: "organization-1",
  companyId: "J-12345678-9",
  installationId: "installation-a",
  workstationId: "workstation-a",
});

const receiptPrinter: DeviceDescriptor = Object.freeze({
  id: "receipt-1",
  category: "receipt-printer",
  manufacturer: "Acme",
  model: "RP-80",
  connection: "serial",
  connectionAddress: "COM3",
  capabilities: ["receipt.print"] as const,
});

const fiscalPrinter: DeviceDescriptor = Object.freeze({
  id: "fiscal-1",
  category: "fiscal-printer",
  manufacturer: "Acme",
  model: "FP-500",
  connection: "network",
  connectionAddress: "10.0.0.8:9100",
  capabilities: ["fiscal.document.issue"] as const,
});

class MemoryRepository implements PrinterBindingRepository {
  private readonly bindings = new Map<string, PrinterBinding>();

  async find(target: PrinterConfigurationScope, purpose: "receipt" | "fiscal"): Promise<PrinterBinding | undefined> {
    return this.bindings.get(key(target, purpose));
  }

  async replace(input: ReplacePrinterBinding): Promise<PrinterBinding> {
    const found = await this.find(input.scope, input.purpose);
    if ((found?.revision ?? null) !== input.expectedRevision) {
      throw new PrinterConfigurationFailure("PRINTER_CONFIGURATION_REVISION_CONFLICT", "Printer binding changed.");
    }
    const binding: PrinterBinding = Object.freeze({
      scope: input.scope,
      purpose: input.purpose,
      device: input.device,
      revision: (found?.revision ?? 0) + 1,
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
    this.bindings.set(key(input.scope, input.purpose), binding);
    return binding;
  }

  async clear(input: ClearPrinterBindingRequest): Promise<void> {
    const found = await this.find(input.scope, input.purpose);
    if (!found || found.revision !== input.expectedRevision) {
      throw new PrinterConfigurationFailure("PRINTER_CONFIGURATION_REVISION_CONFLICT", "Printer binding changed.");
    }
    this.bindings.delete(key(input.scope, input.purpose));
  }
}

class Discovery implements PrinterDeviceDiscovery {
  constructor(private readonly descriptors: readonly DeviceDescriptor[]) {}

  async findDiscovered(_scope: PrinterConfigurationScope, deviceId: string): Promise<DeviceDescriptor | undefined> {
    return this.descriptors.find((descriptor) => descriptor.id === deviceId);
  }
}

class Authorization implements PrinterConfigurationAuthorization {
  readonly actions: PrinterConfigurationAction[] = [];
  denied = false;

  async authorize(_actorId: string, action: PrinterConfigurationAction, _scope: PrinterConfigurationScope): Promise<void> {
    this.actions.push(action);
    if (this.denied) throw new Error("LOCAL_POLICY_DENIED");
  }
}

describe("printer configuration", () => {
  it("stores a safe receipt-printer identity after local discovery and reads it through authorization", async () => {
    const repository = new MemoryRepository();
    const authorization = new Authorization();
    const set = new SetPrinterBinding(repository, new Discovery([receiptPrinter]), authorization);
    const binding = await set.execute({ actorId: "actor-1", scope, purpose: "receipt", deviceId: "receipt-1", expectedRevision: null });

    assert.equal(binding.revision, 1);
    assert.equal(binding.device.category, "receipt-printer");
    assert.equal("connectionAddress" in binding.device, false);
    assert.equal(JSON.stringify(binding).includes("COM3"), false);
    const found = await new GetPrinterBinding(repository, authorization).execute({ actorId: "actor-1", scope, purpose: "receipt" });
    assert.deepEqual(found, binding);
    assert.deepEqual(authorization.actions, ["write", "read"]);
  });

  it("requires a fresh discovered device and purpose-compatible category and capability", async () => {
    const set = new SetPrinterBinding(new MemoryRepository(), new Discovery([receiptPrinter]), new Authorization());
    await assert.rejects(
      () => set.execute({ actorId: "actor-1", scope, purpose: "fiscal", deviceId: "receipt-1", expectedRevision: null }),
      (cause: unknown) => cause instanceof PrinterConfigurationFailure && cause.code === "PRINTER_CONFIGURATION_DEVICE_INCOMPATIBLE",
    );
    await assert.rejects(
      () => set.execute({ actorId: "actor-1", scope, purpose: "receipt", deviceId: "missing", expectedRevision: null }),
      (cause: unknown) => cause instanceof PrinterConfigurationFailure && cause.code === "PRINTER_CONFIGURATION_DEVICE_NOT_DISCOVERED",
    );
    const malformed: DeviceDescriptor = { ...receiptPrinter, id: "bad", capabilities: [] };
    const malformedSet = new SetPrinterBinding(new MemoryRepository(), new Discovery([malformed]), new Authorization());
    await assert.rejects(
      () => malformedSet.execute({ actorId: "actor-1", scope, purpose: "receipt", deviceId: "bad", expectedRevision: null }),
      (cause: unknown) => cause instanceof PrinterConfigurationFailure && cause.code === "PRINTER_CONFIGURATION_DEVICE_INCOMPATIBLE",
    );
    const wrongDescriptor: PrinterDeviceDiscovery = { async findDiscovered() { return receiptPrinter; } };
    await assert.rejects(
      () => new SetPrinterBinding(new MemoryRepository(), wrongDescriptor, new Authorization()).execute({ actorId: "actor-1", scope, purpose: "receipt", deviceId: "another-printer", expectedRevision: null }),
      (cause: unknown) => cause instanceof PrinterConfigurationFailure && cause.code === "PRINTER_CONFIGURATION_INVALID_DEVICE",
    );
    assert.throws(
      () => toCompatibleDeviceReference("other" as "receipt", receiptPrinter),
      (cause: unknown) => cause instanceof PrinterConfigurationFailure && cause.code === "PRINTER_CONFIGURATION_INVALID_SCOPE",
    );
  });

  it("keeps receipt and fiscal selections independent and uses optimistic revisions for replacement and removal", async () => {
    const repository = new MemoryRepository();
    const authorization = new Authorization();
    const set = new SetPrinterBinding(repository, new Discovery([receiptPrinter, fiscalPrinter]), authorization);
    const receipt = await set.execute({ actorId: "actor-1", scope, purpose: "receipt", deviceId: "receipt-1", expectedRevision: null });
    const fiscal = await set.execute({ actorId: "actor-1", scope, purpose: "fiscal", deviceId: "fiscal-1", expectedRevision: null });
    const replacement = await set.execute({ actorId: "actor-1", scope, purpose: "receipt", deviceId: "receipt-1", expectedRevision: receipt.revision });
    assert.equal(replacement.revision, 2);
    assert.equal((await repository.find(scope, "fiscal"))?.revision, fiscal.revision);
    await assert.rejects(
      () => set.execute({ actorId: "actor-1", scope, purpose: "receipt", deviceId: "receipt-1", expectedRevision: receipt.revision }),
      (cause: unknown) => cause instanceof PrinterConfigurationFailure && cause.code === "PRINTER_CONFIGURATION_REVISION_CONFLICT",
    );
    await new ClearPrinterBinding(repository, authorization).execute({ actorId: "actor-1", scope, purpose: "receipt", expectedRevision: replacement.revision });
    assert.equal(await repository.find(scope, "receipt"), undefined);
    assert.deepEqual(authorization.actions, ["write", "write", "write", "write", "clear"]);
  });

  it("delegates authorization to the host policy before local discovery or persistence", async () => {
    const authorization = new Authorization();
    authorization.denied = true;
    const set = new SetPrinterBinding(new MemoryRepository(), new Discovery([receiptPrinter]), authorization);
    await assert.rejects(
      () => set.execute({ actorId: "actor-1", scope, purpose: "receipt", deviceId: "receipt-1", expectedRevision: null }),
      /LOCAL_POLICY_DENIED/,
    );
    assert.deepEqual(authorization.actions, ["write"]);
  });
});

function key(target: PrinterConfigurationScope, purpose: "receipt" | "fiscal"): string {
  return `${target.organizationId}/${target.companyId}/${target.installationId}/${target.workstationId}/${purpose}`;
}
