import { randomUUID } from "node:crypto";
import type { DeviceFailure, DeviceSessionEvent } from "@kontave/device-contracts";
import type { DeviceAdapter, DeviceCandidate, DeviceSession } from "@kontave/devices-core";
import { DelimitedBarcodeParser } from "./barcode-parser";
import type { SerialConnection, SerialPortDescriptor, SerialPortProvider } from "./serial-port-provider";

const DATALOGIC_VENDOR_ID = "05f9";

export interface DatalogicQw2100Configuration {
  readonly baudRate?: number;
  readonly serialPort?: string;
  readonly serialNumber?: string;
  readonly vendorId?: string;
  readonly productId?: string;
}

export class DatalogicQw2100Adapter implements DeviceAdapter {
  readonly id = "datalogic-qw2100-serial";
  readonly capabilities = ["barcode.scan"] as const;

  constructor(
    private readonly ports: SerialPortProvider,
    private readonly configuration: DatalogicQw2100Configuration = {},
  ) {}

  async discover(signal: AbortSignal): Promise<readonly DeviceCandidate[]> {
    signal.throwIfAborted();
    const ports = await this.ports.list();
    signal.throwIfAborted();
    return ports
      .filter((port) => this.matches(port))
      .map((port) => ({ descriptor: this.describe(port), adapterId: this.id }));
  }

  async connect(candidate: DeviceCandidate, signal: AbortSignal): Promise<DeviceSession> {
    signal.throwIfAborted();
    if (candidate.adapterId !== this.id || !candidate.descriptor.connectionAddress) {
      throw failure("DEVICE_CONNECTION_FAILED", "The selected QW2100 connection is invalid.", false);
    }

    const connection = this.ports.create(candidate.descriptor.connectionAddress, {
      baudRate: this.configuration.baudRate ?? 9_600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
    });

    try {
      await connection.open();
    } catch (cause: unknown) {
      throw mapConnectionFailure(cause);
    }

    return new Qw2100Session(candidate.descriptor, connection);
  }

  private matches(port: SerialPortDescriptor): boolean {
    if (this.configuration.serialPort) return port.path === this.configuration.serialPort;
    if (this.configuration.serialNumber) return port.serialNumber === this.configuration.serialNumber;

    if (this.configuration.vendorId || this.configuration.productId) {
      return (
        (!this.configuration.vendorId || normalize(port.vendorId) === normalize(this.configuration.vendorId)) &&
        (!this.configuration.productId || normalize(port.productId) === normalize(this.configuration.productId))
      );
    }

    return normalize(port.vendorId) === DATALOGIC_VENDOR_ID;
  }

  private describe(port: SerialPortDescriptor): DeviceCandidate["descriptor"] {
    const fallbackIdentity = `${port.vendorId ?? "usb"}:${port.productId ?? "serial"}:${port.path}`;
    return {
      id: `qw2100:${port.serialNumber ?? fallbackIdentity}`,
      category: "barcode-scanner",
      manufacturer: port.manufacturer ?? "Datalogic",
      model: "QuickScan QW2100",
      connection: "serial",
      connectionAddress: port.path,
      capabilities: this.capabilities,
    };
  }
}

class Qw2100Session implements DeviceSession {
  private readonly listeners = new Set<(event: DeviceSessionEvent) => void>();
  private readonly unsubscribe: Array<() => void> = [];
  private intentionalClose = false;
  private readonly parser: DelimitedBarcodeParser;

  constructor(
    readonly device: DeviceCandidate["descriptor"],
    private readonly connection: SerialConnection,
  ) {
    this.parser = new DelimitedBarcodeParser((value) => {
      this.publish({
        type: "barcode.scanned",
        eventId: randomUUID(),
        deviceId: this.device.id,
        value,
        occurredAt: new Date().toISOString(),
      });
    });
    this.unsubscribe.push(
      connection.onData((chunk) => this.parser.push(chunk)),
      connection.onError((error) => {
        this.publish({ type: "device.failed", failure: mapConnectionFailure(error) });
      }),
      connection.onClose(() => {
        if (!this.intentionalClose) {
          this.publish({ type: "device.disconnected", deviceId: this.device.id });
        }
      }),
    );
  }

  subscribe(listener: (event: DeviceSessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.parser.reset();
    await this.connection.close();
    this.unsubscribe.splice(0).forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
  }

  private publish(event: DeviceSessionEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}

function normalize(value: string | undefined): string | undefined {
  return value?.toLowerCase().replace(/^0x/, "");
}

function failure(
  code: DeviceFailure["code"],
  message: string,
  recoverable: boolean,
  cause?: unknown,
): DeviceFailure {
  return cause === undefined ? { code, message, recoverable } : { code, message, recoverable, cause };
}

function mapConnectionFailure(cause: unknown): DeviceFailure {
  const message = cause instanceof Error ? cause.message : String(cause);
  const permissionDenied = /access denied|eacces|eperm/i.test(message);
  return failure(
    permissionDenied ? "DEVICE_PERMISSION_DENIED" : "DEVICE_CONNECTION_FAILED",
    permissionDenied
      ? "Kontave does not have permission to open the scanner port."
      : "Kontave could not open the scanner connection.",
    !permissionDenied,
    cause,
  );
}
