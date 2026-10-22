import type { DeviceCapability, DeviceDescriptor } from "@kontave/devices/contracts";

/** A business document output purpose that can be assigned to a local printer. */
export type PrinterPurpose = "receipt" | "fiscal";

/** Action a host application must explicitly authorize before changing a printer binding. */
export type PrinterConfigurationAction = "read" | "write" | "clear";

/**
 * The local environment in which a printer selection is meaningful.
 *
 * This scope deliberately identifies an installation and workstation. It is not a
 * centrally synchronized company preference: physical device discovery is local to
 * the workstation and the package has no server persistence adapter.
 */
export interface PrinterConfigurationScope {
  readonly organizationId: string;
  readonly companyId: string;
  readonly installationId: string;
  readonly workstationId: string;
}

/** Safe device identity retained by a printer binding. Connection addresses and secrets are excluded. */
export interface PrinterDeviceReference {
  readonly id: string;
  readonly category: "receipt-printer" | "fiscal-printer";
  readonly manufacturer: string;
  readonly model: string;
  readonly capabilities: readonly DeviceCapability[];
}

/** Immutable local selection of one compatible printer for one output purpose. */
export interface PrinterBinding {
  readonly scope: PrinterConfigurationScope;
  readonly purpose: PrinterPurpose;
  readonly device: PrinterDeviceReference;
  readonly revision: number;
  readonly updatedAt: string;
}

/** Stable expected failures emitted by printer-configuration use cases. */
export type PrinterConfigurationFailureCode =
  | "PRINTER_CONFIGURATION_INVALID_SCOPE"
  | "PRINTER_CONFIGURATION_INVALID_DEVICE"
  | "PRINTER_CONFIGURATION_DEVICE_NOT_DISCOVERED"
  | "PRINTER_CONFIGURATION_DEVICE_INCOMPATIBLE"
  | "PRINTER_CONFIGURATION_REVISION_CONFLICT";

/** Typed expected error for invalid local printer-configuration input or device selection. */
export class PrinterConfigurationFailure extends Error {
  /**
   * Creates a typed printer-configuration failure.
   * @param code - Stable classification used by the caller to present a safe recovery path.
   * @param message - Human-readable explanation that contains no connection address or secret.
   */
  constructor(readonly code: PrinterConfigurationFailureCode, message: string) {
    super(message);
    this.name = "PrinterConfigurationFailure";
  }
}

/**
 * Authorizes access to a workstation-local printer configuration.
 * Applications supply this policy because the shared authorization schema currently
 * has no printer/device permission and this package must not invent one.
 */
export interface PrinterConfigurationAuthorization {
  /**
   * Verifies the actor can perform an action in a local configuration scope.
   * @param actorId - Authenticated actor requesting the operation.
   * @param action - Read, replacement, or removal action.
   * @param scope - Target installation, workstation, organization, and company.
   * @returns A promise that resolves when allowed.
   * @throws An application-specific authorization error when access is denied.
   */
  authorize(
    actorId: string,
    action: PrinterConfigurationAction,
    scope: PrinterConfigurationScope,
  ): Promise<void>;
}

/** Reads devices discovered by the current local platform adapter. */
export interface PrinterDeviceDiscovery {
  /**
   * Finds a currently discovered device without persisting its transport details.
   * @param scope - Local environment that owns device discovery.
   * @param deviceId - Stable identifier selected by the user or caller.
   * @returns The fresh descriptor, or `undefined` when the device is absent locally.
   * @throws A platform-specific discovery error when local enumeration fails.
   */
  findDiscovered(
    scope: PrinterConfigurationScope,
    deviceId: string,
  ): Promise<DeviceDescriptor | undefined>;
}

/** Persistence port for atomic, workstation-local printer bindings. */
export interface PrinterBindingRepository {
  /**
   * Reads one binding by local scope and purpose.
   * @param scope - Local binding scope.
   * @param purpose - Output purpose to retrieve.
   * @returns The binding, or `undefined` when no printer is configured.
   * @throws A persistence error when the local configuration store cannot be read.
   */
  find(scope: PrinterConfigurationScope, purpose: PrinterPurpose): Promise<PrinterBinding | undefined>;
  /**
   * Atomically stores a binding only when its expected revision still matches.
   * @param input - Validated binding replacement request.
   * @returns The stored binding with its new revision.
   * @throws {PrinterConfigurationFailure} With `PRINTER_CONFIGURATION_REVISION_CONFLICT` when the revision is stale.
   */
  replace(input: ReplacePrinterBinding): Promise<PrinterBinding>;
  /**
   * Atomically removes a binding only when its expected revision still matches.
   * @param input - Scope, purpose, and expected revision for the deletion.
   * @returns A promise that resolves after removal.
   * @throws {PrinterConfigurationFailure} With `PRINTER_CONFIGURATION_REVISION_CONFLICT` when the revision is stale.
   */
  clear(input: ClearPrinterBindingRequest): Promise<void>;
}

/** Atomic replacement request passed only to the binding repository. */
export interface ReplacePrinterBinding {
  readonly scope: PrinterConfigurationScope;
  readonly purpose: PrinterPurpose;
  readonly device: PrinterDeviceReference;
  readonly expectedRevision: number | null;
}

/** Atomic removal request passed only to the binding repository. */
export interface ClearPrinterBindingRequest {
  readonly scope: PrinterConfigurationScope;
  readonly purpose: PrinterPurpose;
  readonly expectedRevision: number;
}

/** Input for reading one local printer binding. */
export interface GetPrinterBindingInput {
  readonly actorId: string;
  readonly scope: PrinterConfigurationScope;
  readonly purpose: PrinterPurpose;
}

/** Input for assigning a fresh locally discovered printer. */
export interface SetPrinterBindingInput extends GetPrinterBindingInput {
  readonly deviceId: string;
  readonly expectedRevision: number | null;
}

/** Input for clearing one local printer binding. */
export interface ClearPrinterBindingInput extends GetPrinterBindingInput {
  readonly expectedRevision: number;
}

/** Reads an authorized local printer selection. */
export class GetPrinterBinding {
  /**
   * Creates the read use case.
   * @param repository - Port that reads local bindings.
   * @param authorization - Caller-provided authorization policy.
   */
  constructor(
    private readonly repository: PrinterBindingRepository,
    private readonly authorization: PrinterConfigurationAuthorization,
  ) {}

  /**
   * Returns the configured binding when one exists.
   * @param input - Actor, local scope, and requested output purpose.
   * @returns The binding or `undefined`.
   * @throws {PrinterConfigurationFailure} When scope input is malformed.
   * @throws An authorization or persistence error from the supplied ports.
   */
  async execute(input: GetPrinterBindingInput): Promise<PrinterBinding | undefined> {
    assertInput(input.actorId, input.scope, input.purpose);
    await this.authorization.authorize(input.actorId, "read", input.scope);
    return this.repository.find(input.scope, input.purpose);
  }
}

/** Validates a discovered compatible device and atomically assigns it to a purpose. */
export class SetPrinterBinding {
  /**
   * Creates the assignment use case.
   * @param repository - Port that atomically stores bindings.
   * @param discovery - Port that verifies a currently local device descriptor.
   * @param authorization - Caller-provided authorization policy.
   */
  constructor(
    private readonly repository: PrinterBindingRepository,
    private readonly discovery: PrinterDeviceDiscovery,
    private readonly authorization: PrinterConfigurationAuthorization,
  ) {}

  /**
   * Stores a compatible discovered device reference without any transport address.
   * @param input - Actor, scope, purpose, selected device ID, and optimistic revision.
   * @returns The new immutable binding.
   * @throws {PrinterConfigurationFailure} When the input is invalid, missing locally, or incompatible.
   * @throws An authorization, discovery, or persistence error from the supplied ports.
   */
  async execute(input: SetPrinterBindingInput): Promise<PrinterBinding> {
    assertInput(input.actorId, input.scope, input.purpose);
    assertNonEmpty(input.deviceId, "device ID", "PRINTER_CONFIGURATION_INVALID_DEVICE");
    assertExpectedRevision(input.expectedRevision, true);
    await this.authorization.authorize(input.actorId, "write", input.scope);
    const descriptor = await this.discovery.findDiscovered(input.scope, input.deviceId);
    if (!descriptor) {
      throw new PrinterConfigurationFailure(
        "PRINTER_CONFIGURATION_DEVICE_NOT_DISCOVERED",
        "The selected printer is not currently discovered on this workstation.",
      );
    }
    if (descriptor.id !== input.deviceId) {
      throw new PrinterConfigurationFailure(
        "PRINTER_CONFIGURATION_INVALID_DEVICE",
        "Local discovery returned a different device than the selected printer.",
      );
    }
    const device = toCompatibleDeviceReference(input.purpose, descriptor);
    return this.repository.replace({
      scope: input.scope,
      purpose: input.purpose,
      device,
      expectedRevision: input.expectedRevision,
    });
  }
}

/** Atomically removes a local printer assignment. */
export class ClearPrinterBinding {
  /**
   * Creates the removal use case.
   * @param repository - Port that atomically removes bindings.
   * @param authorization - Caller-provided authorization policy.
   */
  constructor(
    private readonly repository: PrinterBindingRepository,
    private readonly authorization: PrinterConfigurationAuthorization,
  ) {}

  /**
   * Removes a binding at a known revision.
   * @param input - Actor, scope, purpose, and expected revision.
   * @returns A promise that resolves after successful removal.
   * @throws {PrinterConfigurationFailure} When scope or revision input is malformed.
   * @throws An authorization or persistence error from the supplied ports.
   */
  async execute(input: ClearPrinterBindingInput): Promise<void> {
    assertInput(input.actorId, input.scope, input.purpose);
    assertExpectedRevision(input.expectedRevision, false);
    await this.authorization.authorize(input.actorId, "clear", input.scope);
    await this.repository.clear({
      scope: input.scope,
      purpose: input.purpose,
      expectedRevision: input.expectedRevision,
    });
  }
}

/**
 * Builds a safe persisted device reference after enforcing the requested purpose.
 * @param purpose - Business output purpose to support.
 * @param descriptor - Fresh descriptor returned by local discovery.
 * @returns A transport-free immutable reference.
 * @throws {PrinterConfigurationFailure} When category or capability is incompatible.
 */
export function toCompatibleDeviceReference(
  purpose: PrinterPurpose,
  descriptor: DeviceDescriptor,
): PrinterDeviceReference {
  if (purpose !== "receipt" && purpose !== "fiscal") {
    throw new PrinterConfigurationFailure("PRINTER_CONFIGURATION_INVALID_SCOPE", "The printer purpose is invalid.");
  }
  const expected: Readonly<{ category: "receipt-printer" | "fiscal-printer"; capability: DeviceCapability }> =
    purpose === "receipt"
      ? { category: "receipt-printer", capability: "receipt.print" }
      : { category: "fiscal-printer", capability: "fiscal.document.issue" };
  if (descriptor.category !== expected.category || !descriptor.capabilities.includes(expected.capability)) {
    throw new PrinterConfigurationFailure(
      "PRINTER_CONFIGURATION_DEVICE_INCOMPATIBLE",
      `The selected device cannot be assigned to ${purpose} printing.`,
    );
  }
  assertNonEmpty(descriptor.id, "device ID", "PRINTER_CONFIGURATION_INVALID_DEVICE");
  assertNonEmpty(descriptor.manufacturer, "device manufacturer", "PRINTER_CONFIGURATION_INVALID_DEVICE");
  assertNonEmpty(descriptor.model, "device model", "PRINTER_CONFIGURATION_INVALID_DEVICE");
  return Object.freeze({
    id: descriptor.id,
    category: descriptor.category,
    manufacturer: descriptor.manufacturer,
    model: descriptor.model,
    capabilities: Object.freeze([...descriptor.capabilities]),
  });
}

function assertInput(actorId: string, scope: PrinterConfigurationScope, purpose: PrinterPurpose): void {
  assertNonEmpty(actorId, "actor ID", "PRINTER_CONFIGURATION_INVALID_SCOPE");
  assertScope(scope);
  if (purpose !== "receipt" && purpose !== "fiscal") {
    throw new PrinterConfigurationFailure("PRINTER_CONFIGURATION_INVALID_SCOPE", "The printer purpose is invalid.");
  }
}

function assertScope(scope: PrinterConfigurationScope): void {
  assertNonEmpty(scope.organizationId, "organization ID", "PRINTER_CONFIGURATION_INVALID_SCOPE");
  assertNonEmpty(scope.companyId, "company ID", "PRINTER_CONFIGURATION_INVALID_SCOPE");
  assertNonEmpty(scope.installationId, "installation ID", "PRINTER_CONFIGURATION_INVALID_SCOPE");
  assertNonEmpty(scope.workstationId, "workstation ID", "PRINTER_CONFIGURATION_INVALID_SCOPE");
}

function assertExpectedRevision(value: number | null, allowNull: boolean): void {
  if ((allowNull && value === null) || (Number.isInteger(value) && (value as number) >= 1)) return;
  throw new PrinterConfigurationFailure(
    "PRINTER_CONFIGURATION_INVALID_SCOPE",
    "The expected printer-binding revision is invalid.",
  );
}

function assertNonEmpty(value: string, label: string, code: PrinterConfigurationFailureCode): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new PrinterConfigurationFailure(code, `The ${label} must be a non-empty identifier or label of at most 128 safe characters.`);
  }
}
