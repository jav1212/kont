import { FiscalFailure } from "./fiscal-failure";

export interface FiscalPartySnapshot {
  readonly taxIdentifier: string;
  readonly legalName: string;
  readonly fiscalAddress: string | null;
  readonly additionalInformation: readonly string[];
}

export function fiscalParty(input: FiscalPartySnapshot): FiscalPartySnapshot {
  const taxIdentifier = required(input.taxIdentifier, 64, "tax identifier").toUpperCase().replace(/\s+/g, "");
  const legalName = required(input.legalName, 200, "legal name");
  const fiscalAddress = optional(input.fiscalAddress, 500, "fiscal address");
  const additionalInformation = input.additionalInformation.map((value) => required(value, 500, "additional information"));
  return { taxIdentifier, legalName, fiscalAddress, additionalInformation: Object.freeze(additionalInformation) };
}

function required(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new FiscalFailure("FISCAL_PARTY_INVALID", `Fiscal party ${name} is invalid.`);
  return normalized;
}

function optional(value: string | null, limit: number, name: string): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized ? required(normalized, limit, name) : null;
}
