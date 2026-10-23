/** Money serialized by the tax-reporting API without an implicit currency conversion. */
export interface SerializedIvaMoney {
  readonly currency: { readonly code: string; readonly minorUnit: number };
  readonly minorAmount: string | number | bigint;
}

/**
 * Formats serialized VAT money using Venezuelan separators and the Bs display convention.
 * @param money - Amount and currency metadata returned by the reporting API.
 * @returns Formatted amount, or an em dash when the serialized value is invalid.
 */
export function formatIvaMoney(money: SerializedIvaMoney): string {
  if (!Number.isInteger(money.currency.minorUnit) || money.currency.minorUnit < 0 || money.currency.minorUnit > 12) return "—";
  let minorAmount: bigint;
  try { minorAmount = BigInt(money.minorAmount); } catch { return "—"; }
  const negative = minorAmount < 0n;
  const absolute = negative ? -minorAmount : minorAmount;
  const scale = 10n ** BigInt(money.currency.minorUnit);
  const whole = absolute / scale;
  const fraction = money.currency.minorUnit === 0 ? "" : `,${String(absolute % scale).padStart(money.currency.minorUnit, "0")}`;
  const grouped = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(whole);
  const currency = money.currency.code === "VES" ? "Bs" : money.currency.code;
  return `${currency} ${negative ? "−" : ""}${grouped}${fraction}`;
}
