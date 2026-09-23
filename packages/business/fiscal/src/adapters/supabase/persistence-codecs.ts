import { companyId } from "@kontave/companies/domain";
import { FiscalDocument, fiscalDocumentId, type FiscalDocumentState } from "../../domain";
import { FiscalFailure } from "../../domain/fiscal-failure";

/**
 * Serializes a validated fiscal aggregate for PostgreSQL JSONB persistence.
 * @param document - Immutable document aggregate to store.
 * @returns JSON text preserving bigint minor units as decimal strings.
 */
export function encodeFiscalDocument(document: FiscalDocument): string {
  return JSON.stringify(document, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

/**
 * Rehydrates and revalidates a fiscal aggregate returned by PostgreSQL.
 * @param snapshot - JSONB value read from durable storage.
 * @returns A domain aggregate reconstructed from its historical snapshot.
 * @throws {@link FiscalFailure} When the persisted shape or invariants are invalid.
 */
export function decodeFiscalDocument(snapshot: unknown): FiscalDocument {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Persisted fiscal snapshot is not an object.");
  }

  const json = JSON.stringify(snapshot);
  if (json === undefined) throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Persisted fiscal snapshot cannot be decoded.");

  let state: unknown;
  try {
    state = JSON.parse(json, (key: string, value: unknown) => {
      if (key === "minorAmount" && typeof value === "string" && /^-?\d+$/.test(value)) {
        return BigInt(value);
      }
      return value;
    });
  } catch (error) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Persisted fiscal snapshot contains invalid JSON values.", { cause: error });
  }

  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    throw new FiscalFailure("FISCAL_DOCUMENT_INVALID", "Persisted fiscal snapshot has an invalid shape.");
  }

  const candidate = state as FiscalDocumentState;
  return new FiscalDocument({
    ...candidate,
    id: fiscalDocumentId(String(candidate.id)),
    companyId: companyId(String(candidate.companyId)),
  });
}
