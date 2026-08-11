import { SerialPort } from "serialport";

export interface SerialPortDescriptor {
  readonly path: string;
  readonly manufacturer?: string;
  readonly serialNumber?: string;
  readonly vendorId?: string;
  readonly productId?: string;
}

export interface SerialConnectionOptions {
  readonly baudRate: number;
  readonly dataBits: 5 | 6 | 7 | 8;
  readonly stopBits: 1 | 1.5 | 2;
  readonly parity: "none" | "even" | "mark" | "odd" | "space";
}

export interface SerialConnection {
  readonly isOpen: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  onData(listener: (chunk: Uint8Array) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
  onClose(listener: () => void): () => void;
}

export interface SerialPortProvider {
  list(): Promise<readonly SerialPortDescriptor[]>;
  create(path: string, options: SerialConnectionOptions): SerialConnection;
}

export class NodeSerialPortProvider implements SerialPortProvider {
  async list(): Promise<readonly SerialPortDescriptor[]> {
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      ...(port.manufacturer === undefined ? {} : { manufacturer: port.manufacturer }),
      ...(port.serialNumber === undefined ? {} : { serialNumber: port.serialNumber }),
      ...(port.vendorId === undefined ? {} : { vendorId: port.vendorId }),
      ...(port.productId === undefined ? {} : { productId: port.productId }),
    }));
  }

  create(path: string, options: SerialConnectionOptions): SerialConnection {
    return new NodeSerialConnection(
      new SerialPort({ path, ...options, autoOpen: false }),
    );
  }
}

class NodeSerialConnection implements SerialConnection {
  constructor(private readonly port: SerialPort) {}

  get isOpen(): boolean {
    return this.port.isOpen;
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port.open((error) => (error ? reject(error) : resolve()));
    });
  }

  close(): Promise<void> {
    if (!this.port.isOpen) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.port.close((error) => (error ? reject(error) : resolve()));
    });
  }

  onData(listener: (chunk: Uint8Array) => void): () => void {
    this.port.on("data", listener);
    return () => this.port.off("data", listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.port.on("error", listener);
    return () => this.port.off("error", listener);
  }

  onClose(listener: () => void): () => void {
    this.port.on("close", listener);
    return () => this.port.off("close", listener);
  }
}
