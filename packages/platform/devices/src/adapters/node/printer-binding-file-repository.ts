import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, unlink } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  PrinterConfigurationFailure,
  type ClearPrinterBindingRequest,
  type PrinterBinding,
  type PrinterBindingRepository,
  type PrinterConfigurationScope,
  type PrinterDeviceReference,
  type PrinterPurpose,
  type ReplacePrinterBinding,
} from "@kontave/devices/printer-configuration";

/** Stable failures emitted by the Node file-backed printer-binding repository. */
export type NodePrinterBindingStoreFailureCode =
  | "PRINTER_BINDING_STORE_INVALID_PATH"
  | "PRINTER_BINDING_STORE_CORRUPTED"
  | "PRINTER_BINDING_STORE_LOCK_CONTENDED"
  | "PRINTER_BINDING_STORE_IO";

/** Typed expected error raised while accessing the local printer-binding file. */
export class NodePrinterBindingStoreFailure extends Error {
  /**
   * Creates a safe local-store error.
   * @param code - Stable classification for host recovery and diagnostics.
   * @param message - Safe message that never includes stored device transport details.
   */
  constructor(readonly code: NodePrinterBindingStoreFailureCode, message: string) {
    super(message);
    this.name = "NodePrinterBindingStoreFailure";
  }
}

/** Options for a durable workstation-local printer binding repository. */
export interface NodePrinterBindingFileRepositoryOptions {
  /** Caller-owned absolute path for the JSON configuration file. */
  readonly storagePath: string;
}

interface PersistedStore {
  readonly version: 1;
  readonly bindings: readonly PersistedBinding[];
  readonly tombstones: readonly PersistedTombstone[];
}

interface PersistedBinding {
  readonly scope: PrinterConfigurationScope;
  readonly purpose: PrinterPurpose;
  readonly device: PrinterDeviceReference;
  readonly revision: number;
  readonly updatedAt: string;
}

interface PersistedTombstone {
  readonly scope: PrinterConfigurationScope;
  readonly purpose: PrinterPurpose;
  readonly revision: number;
  readonly clearedAt: string;
}

const EMPTY_STORE: PersistedStore = Object.freeze({ version: 1, bindings: Object.freeze([]), tombstones: Object.freeze([]) });

/**
 * Stores printer bindings in a caller-selected JSON file with optimistic revisions.
 *
 * Each mutation holds an exclusive sibling lock file. Existing locks are never
 * removed as stale: callers receive a typed contention error instead. A tombstone
 * survives clearing so that recreating a binding cannot reuse an old revision.
 */
export class NodePrinterBindingFileRepository implements PrinterBindingRepository {
  private readonly storagePath: string;
  private readonly lockPath: string;

  /**
   * Creates a repository rooted at an explicit caller-owned absolute file path.
   * @param options - Storage location configuration.
   * @throws {NodePrinterBindingStoreFailure} When the supplied storage path is not absolute.
   */
  constructor(options: NodePrinterBindingFileRepositoryOptions) {
    if (typeof options?.storagePath !== "string" || options.storagePath.trim().length === 0 || !isAbsolute(options.storagePath)) {
      throw new NodePrinterBindingStoreFailure("PRINTER_BINDING_STORE_INVALID_PATH", "The printer-binding storage path must be absolute.");
    }
    this.storagePath = resolve(options.storagePath);
    this.lockPath = `${this.storagePath}.lock`;
  }

  /** {@inheritDoc PrinterBindingRepository.find} */
  async find(scope: PrinterConfigurationScope, purpose: PrinterPurpose): Promise<PrinterBinding | undefined> {
    const store = await this.readStore();
    const binding = store.bindings.find((candidate) => key(candidate.scope, candidate.purpose) === key(scope, purpose));
    return binding ? toBinding(binding) : undefined;
  }

  /** {@inheritDoc PrinterBindingRepository.replace} */
  async replace(input: ReplacePrinterBinding): Promise<PrinterBinding> {
    assertReplacementInput(input);
    return this.withExclusiveLock(async () => {
      const store = await this.readStore();
      const targetKey = key(input.scope, input.purpose);
      const existing = store.bindings.find((candidate) => key(candidate.scope, candidate.purpose) === targetKey);
      if ((existing?.revision ?? null) !== input.expectedRevision) {
        throw revisionConflict();
      }
      const tombstone = store.tombstones.find((candidate) => key(candidate.scope, candidate.purpose) === targetKey);
      const revision = Math.max(existing?.revision ?? 0, tombstone?.revision ?? 0) + 1;
      const binding: PersistedBinding = Object.freeze({
        scope: freezeScope(input.scope),
        purpose: input.purpose,
        device: freezeDevice(input.device),
        revision,
        updatedAt: new Date().toISOString(),
      });
      const next: PersistedStore = Object.freeze({
        version: 1,
        bindings: Object.freeze([...store.bindings.filter((candidate) => key(candidate.scope, candidate.purpose) !== targetKey), binding]),
        tombstones: Object.freeze(store.tombstones.filter((candidate) => key(candidate.scope, candidate.purpose) !== targetKey)),
      });
      await this.writeStore(next);
      return toBinding(binding);
    });
  }

  /** {@inheritDoc PrinterBindingRepository.clear} */
  async clear(input: ClearPrinterBindingRequest): Promise<void> {
    assertScopeInput(input.scope);
    if (!isPurpose(input.purpose) || !isRevision(input.expectedRevision)) {
      throw new PrinterConfigurationFailure("PRINTER_CONFIGURATION_INVALID_SCOPE", "The printer-binding clear request is invalid.");
    }
    await this.withExclusiveLock(async () => {
      const store = await this.readStore();
      const targetKey = key(input.scope, input.purpose);
      const existing = store.bindings.find((candidate) => key(candidate.scope, candidate.purpose) === targetKey);
      if (!existing || existing.revision !== input.expectedRevision) {
        throw revisionConflict();
      }
      const tombstone: PersistedTombstone = Object.freeze({
        scope: freezeScope(input.scope),
        purpose: input.purpose,
        revision: existing.revision,
        clearedAt: new Date().toISOString(),
      });
      await this.writeStore(Object.freeze({
        version: 1,
        bindings: Object.freeze(store.bindings.filter((candidate) => key(candidate.scope, candidate.purpose) !== targetKey)),
        tombstones: Object.freeze([...store.tombstones.filter((candidate) => key(candidate.scope, candidate.purpose) !== targetKey), tombstone]),
      }));
    });
  }

  private async withExclusiveLock<T>(operation: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    try {
      await mkdir(dirname(this.storagePath), { recursive: true });
      const handle = await open(this.lockPath, "wx", 0o600);
      try {
        await handle.writeFile(token, "utf8");
      } finally {
        await handle.close();
      }
    } catch (cause) {
      if (isAlreadyExists(cause)) {
        throw new NodePrinterBindingStoreFailure("PRINTER_BINDING_STORE_LOCK_CONTENDED", "Another local process is updating printer bindings.");
      }
      throw storageIoFailure(cause);
    }
    try {
      return await operation();
    } finally {
      await this.releaseOwnLock(token);
    }
  }

  private async releaseOwnLock(token: string): Promise<void> {
    try {
      if ((await readFile(this.lockPath, "utf8")) === token) {
        await unlink(this.lockPath);
      }
    } catch (cause) {
      if (!isNotFound(cause)) throw storageIoFailure(cause);
    }
  }

  private async readStore(): Promise<PersistedStore> {
    try {
      const contents = await readFile(this.storagePath, "utf8");
      return parseStore(contents);
    } catch (cause) {
      if (isNotFound(cause)) return EMPTY_STORE;
      if (cause instanceof NodePrinterBindingStoreFailure) throw cause;
      throw storageIoFailure(cause);
    }
  }

  private async writeStore(store: PersistedStore): Promise<void> {
    const temporaryPath = `${this.storagePath}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(store), "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, this.storagePath);
    } catch (cause) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw storageIoFailure(cause);
    }
  }
}

function parseStore(contents: string): PersistedStore {
  let value: unknown;
  try {
    value = JSON.parse(contents) as unknown;
  } catch {
    throw corruptedStore();
  }
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["version", "bindings", "tombstones"]) || value.version !== 1 || !Array.isArray(value.bindings) || !Array.isArray(value.tombstones)) {
    throw corruptedStore();
  }
  const bindings = value.bindings.map(parseBinding);
  const tombstones = value.tombstones.map(parseTombstone);
  const seen = new Set<string>();
  for (const record of [...bindings, ...tombstones]) {
    const recordKey = key(record.scope, record.purpose);
    if (seen.has(recordKey)) throw corruptedStore();
    seen.add(recordKey);
  }
  return Object.freeze({ version: 1, bindings: Object.freeze(bindings), tombstones: Object.freeze(tombstones) });
}

function parseBinding(value: unknown): PersistedBinding {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["scope", "purpose", "device", "revision", "updatedAt"]) || !isPurpose(value.purpose) || !isRevision(value.revision) || !isIsoDate(value.updatedAt)) throw corruptedStore();
  const device = parseDevice(value.device);
  if (!isCompatible(value.purpose, device)) throw corruptedStore();
  return Object.freeze({ scope: parseScope(value.scope), purpose: value.purpose, device, revision: value.revision, updatedAt: value.updatedAt });
}

function parseTombstone(value: unknown): PersistedTombstone {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["scope", "purpose", "revision", "clearedAt"]) || !isPurpose(value.purpose) || !isRevision(value.revision) || !isIsoDate(value.clearedAt)) throw corruptedStore();
  return Object.freeze({ scope: parseScope(value.scope), purpose: value.purpose, revision: value.revision, clearedAt: value.clearedAt });
}

function parseScope(value: unknown): PrinterConfigurationScope {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["organizationId", "companyId", "installationId", "workstationId"]) || !isSafeText(value.organizationId) || !isSafeText(value.companyId) || !isSafeText(value.installationId) || !isSafeText(value.workstationId)) throw corruptedStore();
  return freezeScope(value as unknown as PrinterConfigurationScope);
}

function parseDevice(value: unknown): PrinterDeviceReference {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["id", "category", "manufacturer", "model", "capabilities"]) || !isSafeText(value.id) || !isSafeText(value.manufacturer) || !isSafeText(value.model) || (value.category !== "receipt-printer" && value.category !== "fiscal-printer") || !Array.isArray(value.capabilities) || !value.capabilities.every(isDeviceCapability)) throw corruptedStore();
  return freezeDevice(value as unknown as PrinterDeviceReference);
}

function freezeScope(scope: PrinterConfigurationScope): PrinterConfigurationScope {
  return Object.freeze({ organizationId: scope.organizationId, companyId: scope.companyId, installationId: scope.installationId, workstationId: scope.workstationId });
}

function freezeDevice(device: PrinterDeviceReference): PrinterDeviceReference {
  return Object.freeze({ id: device.id, category: device.category, manufacturer: device.manufacturer, model: device.model, capabilities: Object.freeze([...device.capabilities]) });
}

function toBinding(binding: PersistedBinding): PrinterBinding {
  return Object.freeze({ scope: freezeScope(binding.scope), purpose: binding.purpose, device: freezeDevice(binding.device), revision: binding.revision, updatedAt: binding.updatedAt });
}

function key(scope: PrinterConfigurationScope, purpose: PrinterPurpose): string {
  return JSON.stringify([scope.organizationId, scope.companyId, scope.installationId, scope.workstationId, purpose]);
}

function revisionConflict(): PrinterConfigurationFailure {
  return new PrinterConfigurationFailure("PRINTER_CONFIGURATION_REVISION_CONFLICT", "The printer binding changed before the local update completed.");
}

function corruptedStore(): NodePrinterBindingStoreFailure {
  return new NodePrinterBindingStoreFailure("PRINTER_BINDING_STORE_CORRUPTED", "The local printer-binding store is malformed and was not changed.");
}

function storageIoFailure(_cause: unknown): NodePrinterBindingStoreFailure {
  return new NodePrinterBindingStoreFailure("PRINTER_BINDING_STORE_IO", "The local printer-binding store could not be accessed safely.");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((keyName) => keys.includes(keyName));
}

function isPurpose(value: unknown): value is PrinterPurpose {
  return value === "receipt" || value === "fiscal";
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isDeviceCapability(value: unknown): value is PrinterDeviceReference["capabilities"][number] {
  return value === "barcode.scan" || value === "receipt.print" || value === "weight.read" || value === "fiscal.document.issue";
}

function isCompatible(purpose: PrinterPurpose, device: PrinterDeviceReference): boolean {
  return purpose === "receipt"
    ? device.category === "receipt-printer" && device.capabilities.includes("receipt.print")
    : device.category === "fiscal-printer" && device.capabilities.includes("fiscal.document.issue");
}

function assertReplacementInput(input: ReplacePrinterBinding): void {
  assertScopeInput(input.scope);
  if (!isPurpose(input.purpose) || (input.expectedRevision !== null && !isRevision(input.expectedRevision))) {
    throw new PrinterConfigurationFailure("PRINTER_CONFIGURATION_INVALID_SCOPE", "The printer-binding replacement request is invalid.");
  }
  if (!isPlainObject(input.device) || !isSafeText(input.device.id) || !isSafeText(input.device.manufacturer) || !isSafeText(input.device.model) || (input.device.category !== "receipt-printer" && input.device.category !== "fiscal-printer") || !Array.isArray(input.device.capabilities) || !input.device.capabilities.every(isDeviceCapability)) {
    throw new PrinterConfigurationFailure("PRINTER_CONFIGURATION_INVALID_DEVICE", "The printer device reference is invalid.");
  }
  if (!isCompatible(input.purpose, input.device)) {
    throw new PrinterConfigurationFailure("PRINTER_CONFIGURATION_DEVICE_INCOMPATIBLE", "The printer device does not support the requested purpose.");
  }
}

function assertScopeInput(scope: PrinterConfigurationScope): void {
  if (!isPlainObject(scope) || !isSafeText(scope.organizationId) || !isSafeText(scope.companyId) || !isSafeText(scope.installationId) || !isSafeText(scope.workstationId)) {
    throw new PrinterConfigurationFailure("PRINTER_CONFIGURATION_INVALID_SCOPE", "The printer-binding scope is invalid.");
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isAlreadyExists(cause: unknown): boolean {
  return isNodeError(cause, "EEXIST");
}

function isNotFound(cause: unknown): boolean {
  return isNodeError(cause, "ENOENT");
}

function isNodeError(cause: unknown, code: string): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && (cause as { readonly code?: unknown }).code === code;
}
