export interface KeyboardWedgeScannerOptions {
    readonly minimumLength?: number;
    readonly maximumLength?: number;
    readonly maximumInterKeyDelayMs?: number;
}

export const KEYBOARD_WEDGE_MAXIMUM_INTER_KEY_DELAY_MS = 50;

/**
 * Recognizes the fast character burst emitted by scanners configured as a USB
 * keyboard. Slow human typing is discarded when the inter-key timeout expires.
 */
export class KeyboardWedgeScanner {
    private buffer = "";
    private lastCharacterAt = 0;
    private readonly minimumLength: number;
    private readonly maximumLength: number;
    private readonly maximumInterKeyDelayMs: number;

    constructor(options: KeyboardWedgeScannerOptions = {}) {
        this.minimumLength = options.minimumLength ?? 4;
        this.maximumLength = options.maximumLength ?? 128;
        this.maximumInterKeyDelayMs = options.maximumInterKeyDelayMs ?? KEYBOARD_WEDGE_MAXIMUM_INTER_KEY_DELAY_MS;
    }

    push(key: string, occurredAt: number): string | null {
        if (key === "Enter") {
            const barcode = this.isCurrentSequence(occurredAt) && this.buffer.length >= this.minimumLength
                ? this.buffer
                : null;
            this.reset();
            return barcode;
        }

        if (key.length !== 1) return null;
        if (!this.isCurrentSequence(occurredAt)) this.reset();
        if (this.buffer.length >= this.maximumLength) {
            this.reset();
            return null;
        }

        this.buffer += key;
        this.lastCharacterAt = occurredAt;
        return null;
    }

    reset(): void {
        this.buffer = "";
        this.lastCharacterAt = 0;
    }

    private isCurrentSequence(occurredAt: number): boolean {
        return this.lastCharacterAt > 0 && occurredAt - this.lastCharacterAt <= this.maximumInterKeyDelayMs;
    }
}
