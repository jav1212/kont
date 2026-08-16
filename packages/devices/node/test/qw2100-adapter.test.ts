import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeviceSessionEvent } from "@kontave/device-contracts";
import {
  DatalogicQw2100Adapter,
  DelimitedBarcodeParser,
  type SerialConnection,
  type SerialConnectionOptions,
  type SerialPortDescriptor,
  type SerialPortProvider,
} from "../src/index";

class TestSerialConnection implements SerialConnection {
  isOpen = false;
  private dataListener: ((chunk: Uint8Array) => void) | undefined;
  private errorListener: ((error: Error) => void) | undefined;
  private closeListener: (() => void) | undefined;

  async open(): Promise<void> { this.isOpen = true; }
  async close(): Promise<void> { this.isOpen = false; this.closeListener?.(); }
  onData(listener: (chunk: Uint8Array) => void): () => void { this.dataListener = listener; return () => { this.dataListener = undefined; }; }
  onError(listener: (error: Error) => void): () => void { this.errorListener = listener; return () => { this.errorListener = undefined; }; }
  onClose(listener: () => void): () => void { this.closeListener = listener; return () => { this.closeListener = undefined; }; }
  emitData(value: string): void { this.dataListener?.(Buffer.from(value)); }
  emitError(error: Error): void { this.errorListener?.(error); }
}

class TestSerialPortProvider implements SerialPortProvider {
  readonly connection = new TestSerialConnection();
  createdPath: string | undefined;
  createdOptions: SerialConnectionOptions | undefined;

  constructor(readonly descriptors: readonly SerialPortDescriptor[]) {}
  async list(): Promise<readonly SerialPortDescriptor[]> { return this.descriptors; }
  create(path: string, options: SerialConnectionOptions): SerialConnection {
    this.createdPath = path;
    this.createdOptions = options;
    return this.connection;
  }
}

describe("DelimitedBarcodeParser", () => {
  it("emits a barcode split across serial chunks", () => {
    const values: string[] = [];
    const parser = new DelimitedBarcodeParser((value) => values.push(value));
    parser.push(Buffer.from("750954"));
    parser.push(Buffer.from("6672779\r"));
    assert.deepEqual(values, ["7509546672779"]);
  });

  it("drops an oversized unterminated input", () => {
    const values: string[] = [];
    const parser = new DelimitedBarcodeParser((value) => values.push(value), 5);
    parser.push(Buffer.from("123456\r"));
    assert.deepEqual(values, []);
  });
});

describe("DatalogicQw2100Adapter", () => {
  it("discovers Datalogic ports and ignores unrelated serial devices", async () => {
    const ports = new TestSerialPortProvider([
      { path: "COM16", vendorId: "05F9", productId: "4204", manufacturer: "Datalogic" },
      { path: "COM3", vendorId: "1234", productId: "5678" },
    ]);
    const adapter = new DatalogicQw2100Adapter(ports);

    const candidates = await adapter.discover(new AbortController().signal);

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.descriptor.connectionAddress, "COM16");
  });

  it("opens the selected port and emits normalized barcode events", async () => {
    const ports = new TestSerialPortProvider([{ path: "COM16", vendorId: "05f9" }]);
    const adapter = new DatalogicQw2100Adapter(ports, { baudRate: 9_600 });
    const candidate = (await adapter.discover(new AbortController().signal))[0];
    assert.ok(candidate);
    const session = await adapter.connect(candidate, new AbortController().signal);
    const events: DeviceSessionEvent[] = [];
    session.subscribe((event) => events.push(event));

    ports.connection.emitData("7509546672779\r");

    assert.equal(ports.createdPath, "COM16");
    assert.equal(ports.createdOptions?.baudRate, 9_600);
    assert.equal(events[0]?.type, "barcode.scanned");
    if (events[0]?.type === "barcode.scanned") {
      assert.equal(events[0].value, "7509546672779");
    }
    await session.disconnect();
  });
});
