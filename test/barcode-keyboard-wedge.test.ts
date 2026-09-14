import assert from "node:assert/strict";
import test from "node:test";
import { KeyboardWedgeScanner, type KeyboardWedgeKey } from "../src/shared/frontend/devices/keyboard-wedge-scanner";

const badge = "KONT-AbCdEfGhIjKlMnOpQrSt_";

function keyFor(character: string, logical = character, capsLock = false): KeyboardWedgeKey {
    if (/^[A-Za-z]$/.test(character)) {
        const upper = character === character.toUpperCase();
        return { key: logical, code: `Key${character.toUpperCase()}`, shiftKey: upper !== capsLock, capsLock };
    }
    if (/^[0-9]$/.test(character)) return { key: logical, code: `Digit${character}`, shiftKey: false, capsLock };
    return { key: logical, code: "Minus", shiftKey: character === "_", capsLock };
}

function read(scanner: KeyboardWedgeScanner, value: string, configure: (character: string, index: number) => KeyboardWedgeKey = (character) => keyFor(character)) {
    let time = 100;
    for (const [index, character] of [...value].entries()) { scanner.push(configure(character, index), time); time += 5; }
    return scanner.push({ key: "Enter", code: "Enter", shiftKey: false, capsLock: false }, time);
}

test("keeps a complete valid logical credential even when physical positions differ", () => {
    const scan = read(new KeyboardWedgeScanner(), badge, (character) => character === "_"
        ? { key: "_", code: "Minus", shiftKey: false, capsLock: false }
        : keyFor(character));
    assert.deepEqual(scan, { barcode: badge, badgeBarcode: badge });
});

test("recovers a US-HID credential when a Spanish layout translates minus and underscore", () => {
    const scan = read(new KeyboardWedgeScanner(), badge, (character) => keyFor(character, character === "-" ? "'" : character === "_" ? "?" : character));
    assert.equal(scan?.barcode, "KONT'AbCdEfGhIjKlMnOpQrSt?");
    assert.equal(scan?.badgeBarcode, badge);
});

test("recovers a malformed layout read when Caps Lock is on and the scanner compensates with Shift", () => {
    const scan = read(new KeyboardWedgeScanner(), badge, (character) => keyFor(character, character === "-" ? "'" : character === "_" ? "?" : character, true));
    assert.equal(scan?.barcode, "KONT'AbCdEfGhIjKlMnOpQrSt?");
    assert.equal(scan?.badgeBarcode, badge);
});

test("does not reconstruct after an unsupported or shifted physical key", () => {
    const unsupported = read(new KeyboardWedgeScanner(), badge, (character, index) => index === 8
        ? { key: "#", code: "Unidentified", shiftKey: false, capsLock: false }
        : keyFor(character, character === "-" ? "'" : character === "_" ? "?" : character));
    assert.equal(unsupported?.badgeBarcode, null);

    const withShiftedDigit = read(new KeyboardWedgeScanner(), "KONT-A1CdEfGhIjKlMnOpQrSt_", (character) => character === "1"
        ? { key: "1", code: "Digit1", shiftKey: true, capsLock: false }
        : keyFor(character, character === "-" ? "'" : character === "_" ? "?" : character));
    assert.equal(withShiftedDigit?.badgeBarcode, null);

    const deadKey = read(new KeyboardWedgeScanner(), badge, (character, index) => index === 8
        ? { key: "Dead", code: "Quote", shiftKey: false, capsLock: false }
        : keyFor(character, character === "-" ? "'" : character === "_" ? "?" : character));
    assert.equal(deadKey?.badgeBarcode, null);
});

test("keeps ordinary product values logical and rejects slow and overflowed frames", () => {
    const product = read(new KeyboardWedgeScanner(), "AB'123", (character) => character === "'"
        ? { key: "'", code: "Minus", shiftKey: false, capsLock: false }
        : keyFor(character));
    assert.deepEqual(product, { barcode: "AB'123", badgeBarcode: null });

    const slow = new KeyboardWedgeScanner();
    slow.push(keyFor("K"), 100);
    slow.push(keyFor("O"), 200);
    assert.equal(slow.push({ key: "Enter", code: "Enter", shiftKey: false, capsLock: false }, 205), null);

    const overflow = new KeyboardWedgeScanner({ maximumLength: 4 });
    assert.equal(read(overflow, `${badge}TAIL`), null);
});
