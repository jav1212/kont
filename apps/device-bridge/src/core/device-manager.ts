import type { DeviceDescriptor, DeviceEvent, DeviceFailure, DeviceLifecycleState } from "@kontave/device-contracts";
import { DeviceManager as CoreDeviceManager, ExponentialBackoffPolicy, type DeviceEventSink, type DeviceLogger } from "@kontave/devices-core";
import { DatalogicQw2100Adapter, NodeSerialPortProvider, type DatalogicQw2100Configuration } from "@kontave/devices-node";
import type { DeviceGateway } from "../gateway/device-gateway";
import type { DeviceInfo, DeviceStatus } from "../protocol/contracts";
import type { ManagerConfig } from "./config";
import type { Logger } from "./logger";

export interface ManagerSnapshot {
  readonly status: DeviceStatus;
  readonly device: DeviceInfo | null;
  readonly lastError: string | null;
  readonly gatewayUrl: string | null;
}

/** Hosts the portable device subsystem and translates it to the existing Web protocol. */
export class DeviceManager implements DeviceEventSink, DeviceLogger {
  private snapshot: ManagerSnapshot = { status: "disconnected", device: null, lastError: null, gatewayUrl: null };
  private readonly core: CoreDeviceManager;
  private readonly listeners = new Set<(snapshot: ManagerSnapshot) => void>();
  private stopped = true;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(config: ManagerConfig, private readonly gateway: DeviceGateway, private readonly logger: Logger) {
    const scanner = new DatalogicQw2100Adapter(new NodeSerialPortProvider(), scannerConfiguration(config));
    this.core = new CoreDeviceManager({ adapters: [scanner], events: this, logger: this });
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.snapshot = { ...this.snapshot, gatewayUrl: await this.gateway.start() };
    this.logger.info("Gateway iniciado", this.snapshot.gatewayUrl);
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    await this.core.stop();
    await this.gateway.stop();
    this.update({ status: "disconnected", device: null, lastError: null });
  }

  getSnapshot(): ManagerSnapshot { return { ...this.snapshot }; }

  onChange(listener: (snapshot: ManagerSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  publish(event: DeviceEvent): void {
    if (event.type === "device.state-changed") {
      this.update({ status: mapState(event.state) });
    } else if (event.type === "device.connected") {
      this.update({ status: "connected", device: toLegacyDevice(event.device), lastError: null });
    } else if (event.type === "barcode.scanned") {
      const device = this.snapshot.device;
      if (device) this.gateway.broadcast({ type: "barcode.scanned", eventId: event.eventId, device, barcode: event.value, occurredAt: event.occurredAt });
    } else if (event.type === "device.disconnected") {
      this.update({ status: "reconnecting", device: null });
      this.scheduleReconnect();
    } else {
      this.update({ status: event.failure.recoverable ? "reconnecting" : "error", lastError: event.failure.message });
    }
  }

  info(code: string, context?: Readonly<Record<string, unknown>>): void { this.logger.info(code, context); }

  error(failure: DeviceFailure, context?: Readonly<Record<string, unknown>>): void {
    this.logger.error(failure.code, { message: failure.message, ...context });
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.core.connectFirst("barcode.scan", { reconnection: new ExponentialBackoffPolicy(5, 1_000, 30_000) });
    } catch (failure: unknown) {
      const message = isFailure(failure) ? failure.message : "Error desconocido de dispositivo";
      this.logger.error("No se pudo conectar", message);
      this.update({ status: "error", device: null, lastError: message });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, 30_000);
  }

  private update(change: Partial<ManagerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.gateway.broadcast({
      type: "device.status",
      device: this.snapshot.device,
      status: this.snapshot.status,
      ...(this.snapshot.lastError ? { message: this.snapshot.lastError } : {}),
    });
    this.listeners.forEach((listener) => listener(this.getSnapshot()));
  }
}

function scannerConfiguration(config: ManagerConfig): DatalogicQw2100Configuration {
  return {
    baudRate: config.baudRate,
    ...(config.serialPort === undefined ? {} : { serialPort: config.serialPort }),
    ...(config.serialNumber === undefined ? {} : { serialNumber: config.serialNumber }),
    ...(config.vendorId === undefined ? {} : { vendorId: config.vendorId }),
    ...(config.productId === undefined ? {} : { productId: config.productId }),
  };
}

function mapState(state: DeviceLifecycleState): DeviceStatus {
  const states: Record<DeviceLifecycleState, DeviceStatus> = {
    idle: "disconnected", discovering: "detecting", connecting: "connecting", ready: "connected",
    reconnecting: "reconnecting", "requires-action": "error", stopped: "disconnected",
  };
  return states[state];
}

function toLegacyDevice(device: DeviceDescriptor): DeviceInfo {
  return { id: device.id, category: device.category, manufacturer: device.manufacturer, model: device.model, connection: device.connectionAddress ?? device.connection };
}

function isFailure(value: unknown): value is { readonly message: string } {
  return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string";
}
