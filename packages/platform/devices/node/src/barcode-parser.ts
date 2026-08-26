export class DelimitedBarcodeParser {
  private buffer = "";

  constructor(
    private readonly emit: (barcode: string) => void,
    private readonly maximumLength = 128,
  ) {
    if (!Number.isInteger(maximumLength) || maximumLength < 1) {
      throw new RangeError("maximumLength must be a positive integer.");
    }
  }

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

  reset(): void {
    this.buffer = "";
  }

  private flush(): void {
    const value = this.buffer.trim();
    this.buffer = "";
    if (value) this.emit(value);
  }
}
