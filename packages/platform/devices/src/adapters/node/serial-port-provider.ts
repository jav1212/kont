import { SerialPort } from "serialport";

/** Portable serial-port discovery metadata required by device adapters. */
export interface SerialPortDescriptor {
  readonly path: string;
  readonly manufacturer?: string;
  readonly serialNumber?: string;
  readonly vendorId?: string;
  readonly productId?: string;
}

/** Explicit serial connection configuration. */
export interface SerialConnectionOptions {
  readonly baudRate: number;
  readonly dataBits: 5 | 6 | 7 | 8;
  readonly stopBits: 1 | 1.5 | 2;
  readonly parity: "none" | "even" | "mark" | "odd" | "space";
}

/** Narrow lifecycle and event boundary for one serial connection. */
export interface SerialConnection {
  readonly isOpen: boolean;
  /**
   * Opens the serial connection.
   * @returns A promise that resolves when the port is open.
   * @throws A serialport SDK failure when the port cannot be opened.
   */
  open(): Promise<void>;
  /**
   * Closes the serial connection idempotently.
   * @returns A promise that resolves when the port is closed.
   * @throws A serialport SDK failure when an open port cannot be closed.
   */
  close(): Promise<void>;
  /**
   * Subscribes to incoming serial data.
   * @param listener - Callback receiving raw data chunks.
   * @returns A function that removes the listener.
   */
  onData(listener: (chunk: Uint8Array) => void): () => void;
  /**
   * Subscribes to serial connection failures.
   * @param listener - Callback receiving SDK errors.
   * @returns A function that removes the listener.
   */
  onError(listener: (error: Error) => void): () => void;
  /**
   * Subscribes to connection closure.
   * @param listener - Callback invoked after closure.
   * @returns A function that removes the listener.
   */
  onClose(listener: () => void): () => void;
}

/** Platform port used to discover and create serial connections. */
export interface SerialPortProvider {
  /**
   * Lists serial ports currently visible to the process.
   * @returns Portable serial-port descriptors.
   * @throws A platform failure when enumeration is unavailable.
   */
  list(): Promise<readonly SerialPortDescriptor[]>;
  /**
   * Creates a closed serial connection without opening it implicitly.
   * @param path - Platform serial-port path.
   * @param options - Explicit serial communication parameters.
   * @returns A serial connection controlled by the caller.
   */
  create(path: string, options: SerialConnectionOptions): SerialConnection;
}

/** SerialPort SDK adapter for Node and Electron main processes. */
export class NodeSerialPortProvider implements SerialPortProvider {
  /** {@inheritDoc SerialPortProvider.list} */
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

  /** {@inheritDoc SerialPortProvider.create} */
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
