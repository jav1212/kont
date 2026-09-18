import { isValidBadgeBarcode } from "./barcode-access-policy";

export interface KeyboardWedgeScannerOptions {
    readonly minimumLength?: number;
    readonly maximumLength?: number;
    readonly maximumInterKeyDelayMs?: number;
}

/** A keyboard event reduced to the fields needed to decode a scanner wedge. */
export interface KeyboardWedgeKey {
    readonly key: string;
    readonly code: string;
    readonly shiftKey: boolean;
    readonly capsLock: boolean;
}

/** A completed wedge read, retaining the logical and credential-safe values. */
export interface KeyboardWedgeScan {
    /** Value translated by the operating system's active keyboard layout. */
    readonly barcode: string;
    /** Exact credential recovered from US HID positions, when necessary. */
    readonly badgeBarcode: string | null;
}

export const KEYBOARD_WEDGE_MAXIMUM_INTER_KEY_DELAY_MS = 50;

/**
 * Recognizes the fast character burst emitted by scanners configured as a USB
 * keyboard. Slow human typing is discarded when the inter-key timeout expires.
 */
export class KeyboardWedgeScanner {
    private buffer = "";
    private physicalBuffer: string | null = "";
    private lastCharacterAt: number | null = null;
    private discardUntilDelimiter = false;
    private readonly minimumLength: number;
    private readonly maximumLength: number;
    private readonly maximumInterKeyDelayMs: number;

    /**
     * Creates a scanner burst recognizer with bounded input and timing.
     *
     * @param options - Optional scanner timing and length limits.
     * @returns A keyboard wedge scanner ready to receive events.
     */
    constructor(options: KeyboardWedgeScannerOptions = {}) {
        this.minimumLength = options.minimumLength ?? 4;
        this.maximumLength = options.maximumLength ?? 128;
        this.maximumInterKeyDelayMs = options.maximumInterKeyDelayMs ?? KEYBOARD_WEDGE_MAXIMUM_INTER_KEY_DELAY_MS;
    }

    /**
     * Adds one keyboard event to the current burst.
     *
     * @param input - Logical key plus its physical HID position and modifiers.
     * @param occurredAt - Monotonic event time in milliseconds.
     * @returns The completed read, or null until the reader sends Enter.
     */
    push(input: KeyboardWedgeKey, occurredAt: number): KeyboardWedgeScan | null {
        if (input.key === "Enter") {
            if (this.discardUntilDelimiter) {
                this.reset();
                return null;
            }
            const barcode = this.isCurrentSequence(occurredAt) && this.buffer.length >= this.minimumLength
                ? this.buffer
                : null;
            const physicalBarcode = barcode && this.physicalBuffer !== null ? this.physicalBuffer : null;
            this.reset();
            return barcode ? {
                barcode,
                badgeBarcode: isValidBadgeBarcode(barcode)
                    ? barcode
                    : physicalBarcode && isValidBadgeBarcode(physicalBarcode) ? physicalBarcode : null,
            } : null;
        }

        if (input.key.length !== 1) {
            if (!isModifierKey(input.key)) this.reset();
            return null;
        }
        if (this.discardUntilDelimiter) return null;
        if (!this.isCurrentSequence(occurredAt)) this.reset();
        if (this.buffer.length >= this.maximumLength) {
            this.buffer = "";
            this.physicalBuffer = null;
            this.lastCharacterAt = null;
            this.discardUntilDelimiter = true;
            return null;
        }

        this.buffer += input.key;
        if (this.physicalBuffer !== null) {
            const character = usHidCharacter(input);
            this.physicalBuffer = character === null ? null : this.physicalBuffer + character;
        }
        this.lastCharacterAt = occurredAt;
        return null;
    }

    /**
     * Discards an incomplete keyboard burst.
     *
     * @returns Nothing.
     */
    reset(): void {
        this.buffer = "";
        this.physicalBuffer = "";
        this.lastCharacterAt = null;
        this.discardUntilDelimiter = false;
    }

    /**
     * Shares the recognizer's burst boundary with editable-target capture.
     *
     * @param occurredAt - Browser event timestamp, independent of handler delays.
     * @returns Whether the event continues the buffered burst.
     */
    isCurrentSequence(occurredAt: number): boolean {
        return this.lastCharacterAt !== null && occurredAt >= this.lastCharacterAt
            && occurredAt - this.lastCharacterAt <= this.maximumInterKeyDelayMs;
    }
}

/**
 * Decodes the US HID positions used by Kontave credential barcodes.
 *
 * The reader is configured as a US keyboard, while `event.key` follows the
 * workstation layout. Limiting this mapping to credential characters prevents
 * it from changing normal product scanner values.
 *
 * @param input - Physical key information from the browser keyboard event.
 * @returns The US ASCII character, or null when the key cannot be decoded.
 */
function usHidCharacter(input: KeyboardWedgeKey): string | null {
    if (/^Key[A-Z]$/.test(input.code)) {
        const letter = input.code.at(-1)!;
        return input.shiftKey !== input.capsLock ? letter : letter.toLowerCase();
    }
    if (/^Digit[0-9]$/.test(input.code)) return input.shiftKey ? null : input.code.at(-1)!;
    if (input.code === "Minus") return input.shiftKey ? "_" : "-";
    return null;
}

/**
 * Identifies non-printing modifier events that accompany a keyboard wedge.
 *
 * @param key - Browser logical key value.
 * @returns Whether the event is a modifier and may be ignored safely.
 */
function isModifierKey(key: string): boolean {
    return key === "Shift" || key === "Control" || key === "Alt" || key === "Meta" || key === "CapsLock";
}
