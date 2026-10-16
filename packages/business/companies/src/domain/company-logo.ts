import { CompanyFailure } from "./index";

/** MIME types accepted for a company logo. */
export type CompanyLogoContentType = "image/png" | "image/jpeg" | "image/webp";

/** Maximum accepted logo payload size in bytes (5 MiB). */
export const COMPANY_LOGO_MAX_BYTES = 5 * 1024 * 1024;

/** Portable binary logo input. Its bytes are never persisted in the company aggregate. */
export interface CompanyLogoFile {
  readonly bytes: Uint8Array;
  readonly contentType: CompanyLogoContentType;
}

/**
 * Validates an image offered as a company logo.
 * @param value - Binary image and declared content type received at the trusted server boundary.
 * @returns The validated logo input without copying its binary payload.
 * @throws {CompanyFailure} When the type or payload size is not admitted.
 */
export function companyLogoFile(value: CompanyLogoFile): CompanyLogoFile {
  if (!(value.bytes instanceof Uint8Array)
    || value.bytes.byteLength < 1
    || value.bytes.byteLength > COMPANY_LOGO_MAX_BYTES
    || !["image/png", "image/jpeg", "image/webp"].includes(value.contentType)
    || !hasExpectedImageSignature(value.bytes, value.contentType)) {
    throw new CompanyFailure("COMPANY_LOGO_INVALID", "The company logo must be a PNG, JPEG, or WebP image no larger than 5 MiB.");
  }
  return Object.freeze({ bytes: value.bytes, contentType: value.contentType });
}

function hasExpectedImageSignature(bytes: Uint8Array, contentType: CompanyLogoContentType): boolean {
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

/**
 * Validates a public HTTPS address persisted as a company logo reference.
 * @param value - URL returned by trusted object storage, or null when no logo is configured.
 * @returns A normalized URL or null.
 * @throws {CompanyFailure} When the address is malformed, not HTTPS, or exceeds storage limits.
 */
export function companyLogoUrl(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 2_048) {
    throw new CompanyFailure("COMPANY_LOGO_INVALID", "The company logo URL is invalid.");
  }
  try {
    if (new URL(normalized).protocol !== "https:") throw new TypeError("The logo URL must use HTTPS.");
  } catch (cause: unknown) {
    throw new CompanyFailure("COMPANY_LOGO_INVALID", "The company logo URL is invalid.", { cause });
  }
  return normalized;
}
