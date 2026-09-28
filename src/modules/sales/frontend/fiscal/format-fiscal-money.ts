import type { FiscalMoneyDto } from "./fiscal-document-types";

/**
 * Formats a JSON-safe minor-unit amount without coercing it through Number.
 * @param money - Encoded fiscal money whose minor amount is a signed integer string.
 * @returns Localized presentation text preserving every integral digit exactly.
 * @throws No expected errors for the typed API shape; invalid values produce a visible fallback.
 */
export function formatFiscalMoney(money: FiscalMoneyDto): string {
  const currency = money.currency.code;
  const minorUnit = money.currency.minorUnit;
  const raw = money.minorAmount;
  if (!/^-?\d+$/.test(raw) || !Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 20) {
    return "Importe inválido";
  }
  const negative = raw.startsWith("-");
  const digits = (negative ? raw.slice(1) : raw).replace(/^0+(?=\d)/, "");
  const padded = digits.padStart(minorUnit + 1, "0");
  const whole = padded.slice(0, padded.length - minorUnit) || "0";
  const fraction = minorUnit ? padded.slice(-minorUnit) : "";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${currency} ${grouped}${minorUnit ? `,${fraction}` : ""}`;
}
