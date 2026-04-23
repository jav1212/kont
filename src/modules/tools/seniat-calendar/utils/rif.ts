// ============================================================================
// RIF Utilities — Venezuelan Tax ID
// Format: X-NNNNNNNN-C
//   X = type prefix: J (Jurídica), G (Gobierno), V (Venezolano), E (Extranjero), P (Pasaporte)
//   NNNNNNNN = 7-9 digits
//   C = verification digit (used by SENIAT to assign payment dates for Especiales)
// ============================================================================

const RIF_REGEX = /^[JGVEP]-\d{7,9}-\d$/;

// Strip all non-alphanumeric characters except letters in the prefix set
export function normalizeRif(raw: string): string {
    // Remove all spaces, force uppercase
    const clean = raw.trim().toUpperCase().replace(/\s+/g, "");
    return clean;
}

/**
 * Validates a RIF string (already normalized or raw).
 * Returns true if the format matches X-NNNNNNNN-C.
 */
export function validateRif(raw: string): boolean {
    const normalized = normalizeRif(raw);
    return RIF_REGEX.test(normalized);
}

/**
 * Extracts the last digit (verification digit / dígito verificador) from a RIF.
 * SENIAT uses this digit to assign payment dates for sujetos pasivos especiales.
 * Returns null if the RIF is invalid.
 */
export function extractLastDigit(rif: string): number | null {
    const normalized = normalizeRif(rif);
    if (!validateRif(normalized)) return null;
    const lastChar = normalized[normalized.length - 1];
    return parseInt(lastChar, 10);
}

/**
 * Applies an input mask to a RIF as the user types.
 * Accepts raw input (with or without dashes) and returns the formatted version.
 *
 * If the user types a second dash (explicitly marking the body→check boundary),
 * that split is honored — otherwise, the mask assumes the typical 8-digit body
 * and treats the 9th digit as the check digit.
 *
 * Examples:
 *   "J"               → "J"
 *   "J1"              → "J-1"
 *   "J12345678"       → "J-12345678"
 *   "J123456789"      → "J-12345678-9"       (common: 8-body + check)
 *   "J1234567890"     → "J-123456789-0"      (10-digit body + check)
 *   "J-303968821-"    → "J-303968821-"       (user-typed dash is preserved)
 *   "J-30396882-1"    → "J-30396882-1"       (user-typed split honored)
 */
export function formatRifMask(raw: string): string {
    const upper = raw.toUpperCase();
    const firstDash = upper.indexOf("-");
    const secondDash = firstDash >= 0 ? upper.indexOf("-", firstDash + 1) : -1;
    const hasTrailingDash = upper.endsWith("-") && upper.length > 1;

    const clean = upper.replace(/[-\s]/g, "");
    if (clean.length === 0) return "";

    const prefix = clean[0];
    if (!/^[JGVEP]$/.test(prefix)) {
        return clean.slice(0, 1);
    }

    const digits = clean.slice(1).replace(/\D/g, "");
    if (digits.length === 0) return prefix;

    let body: string;
    let check: string;
    let needTrailingDash = false;

    if (secondDash >= 0) {
        // Honor the user's explicit split.
        const bodyFromInput = upper.slice(0, secondDash).replace(/[-\s]/g, "").slice(1).replace(/\D/g, "");
        body = bodyFromInput.slice(0, 9);
        check = digits.slice(body.length, body.length + 1);
        if (!check) needTrailingDash = true;
    } else if (digits.length <= 8) {
        // No explicit split yet, not enough digits to infer — keep everything in body.
        body = digits;
        check = "";
        if (hasTrailingDash && body.length >= 7) needTrailingDash = true;
    } else {
        // 9+ digits, no explicit split → assume the most common layout:
        //   9 digits = 8-body + 1-check
        //   10 digits = 9-body + 1-check
        const bodyLen = digits.length === 9 ? 8 : 9;
        body = digits.slice(0, bodyLen);
        check = digits.slice(bodyLen, bodyLen + 1);
    }

    if (body.length === 0) return prefix;
    if (check) return `${prefix}-${body}-${check}`;
    if (needTrailingDash) return `${prefix}-${body}-`;
    return `${prefix}-${body}`;
}

/**
 * Parses a raw RIF string (with or without dashes) into its components.
 * Returns null if invalid.
 */
export function parseRif(raw: string): { prefix: string; body: string; checkDigit: string } | null {
    const normalized = normalizeRif(raw);
    if (!validateRif(normalized)) return null;

    const parts = normalized.split("-");
    return {
        prefix: parts[0],
        body: parts[1],
        checkDigit: parts[2],
    };
}
