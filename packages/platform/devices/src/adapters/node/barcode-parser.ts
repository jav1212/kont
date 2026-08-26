/** Incremental parser for ASCII barcodes delimited by carriage return or line feed. */
export class DelimitedBarcodeParser {
  private buffer = "";

  /**
   * Creates a bounded incremental barcode parser.
   * @param emit - Callback invoked for each complete non-empty barcode.
   * @param maximumLength - Maximum accepted unterminated barcode length.
   * @throws {RangeError} When maximum length is not a positive integer.
   */
  constructor(
    private readonly emit: (barcode: string) => void,
    private readonly maximumLength = 128,
  ) {
    if (!Number.isInteger(maximumLength) || maximumLength < 1) {
      throw new RangeError("maximumLength must be a positive integer.");
    }
  }

  /**
   * Consumes the next byte chunk and emits any completed barcodes synchronously.
   * @param chunk - Raw bytes read from the device connection.
   * @returns Nothing.
   */
  push(chunk: Uint8Array): void {
    for (const byte of chunk) {
      if (byte === 10 || byte === 13) {
        this.flush();
      } else if (byte >= 32 && byte <= 126) {
        this.buffer += String.fromCharCode(byte);
        if (this.buffer.length > this.maximumLength) this.buffer = "";
      }
    }
  }

  /**
   * Discards any unterminated buffered barcode.
   * @returns Nothing.
   */
  reset(): void {
    this.buffer = "";
  }

  private flush(): void {
    const value = this.buffer.trim();
    this.buffer = "";
    if (value) this.emit(value);
  }
}
