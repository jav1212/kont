import { AccountingFailure } from "./failure";

/** One fixed-width level in an accounting code hierarchy. */
export interface CodeSegment {
  readonly length: number;
  readonly separator: string | null;
}
/** Versioned mask used by one chart of accounts. */
export interface CodeStructure {
  readonly segments: readonly CodeSegment[];
}

/** Validates a chart code mask and returns its immutable normalized form.
 * @param value - Candidate ordered segments.
 * @returns A validated structure with 1 to 9 levels.
 * @throws {AccountingFailure} When a length, separator, or total mask size is invalid.
 */
export function codeStructure(value: CodeStructure): CodeStructure {
  if (
    !value ||
    !Array.isArray(value.segments) ||
    value.segments.length < 1 ||
    value.segments.length > 9
  )
    throw new AccountingFailure(
      "INVALID",
      "A code structure needs between one and nine segments.",
    );
  let total = 0;
  const segments = value.segments.map((segment, index) => {
    if (
      !segment ||
      typeof segment !== "object" ||
      !Number.isSafeInteger(segment.length) ||
      segment.length < 1 ||
      segment.length > 30
    )
      throw new AccountingFailure(
        "INVALID",
        "A code segment length is invalid.",
      );
    if (
      index === 0
        ? segment.separator !== null
        : typeof segment.separator !== "string" ||
          !/^[.\-/]$/.test(segment.separator)
    )
      throw new AccountingFailure("INVALID", "Code separators are invalid.");
    total += segment.length + (segment.separator?.length ?? 0);
    return { length: segment.length, separator: segment.separator };
  });
  if (total > 30)
    throw new AccountingFailure(
      "INVALID",
      "A code structure cannot exceed 30 characters.",
    );
  return { segments };
}

/** Derives the hierarchy level and parent code from a code and its chart structure.
 * @param structure - Valid code mask.
 * @param code - Candidate account code.
 * @returns The one-based hierarchy level and immediate parent code, if any.
 * @throws {AccountingFailure} When the code does not end at a valid mask level.
 */
export function accountCodePosition(
  structure: CodeStructure,
  code: string,
): { readonly level: number; readonly parentCode: string | null } {
  const valid = codeStructure(structure);
  const normalized = normalizeCode(code);
  let offset = 0;
  for (const [index, segment] of valid.segments.entries()) {
    if (index > 0) {
      const separator = segment.separator ?? "";
      if (normalized.slice(offset, offset + separator.length) !== separator)
        throw outside();
      offset += separator.length;
    }
    const start = offset;
    const part = normalized.slice(offset, offset + segment.length);
    if (!new RegExp(`^[A-Z0-9]{${segment.length}}$`).test(part))
      throw outside();
    offset += segment.length;
    if (offset === normalized.length)
      return {
        level: index + 1,
        parentCode:
          index === 0
            ? null
            : normalized.slice(0, start - (segment.separator?.length ?? 0)),
      };
  }
  throw outside();
}

/** Normalizes a code before a uniqueness or structure comparison.
 * @param value - User supplied account code.
 * @returns Uppercase trimmed code.
 * @throws {AccountingFailure} When the code is blank or too long.
 */
export function normalizeCode(value: string): string {
  const normalized =
    typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!normalized || normalized.length > 30) throw outside();
  return normalized;
}
function outside(): AccountingFailure {
  return new AccountingFailure(
    "CODE_OUT_OF_STRUCTURE",
    "The account code does not fit the chart structure.",
  );
}
