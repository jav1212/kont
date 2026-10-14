import type { TaxReportingScope } from "../domain";

/** Uninterpreted record returned by the authorized, read-only legacy VAT source port. */
export interface LegacyVatSourceRecord {
  readonly id: string;
  readonly kind: string;
  readonly affectedId: string | null;
  readonly documentDate: string | null;
  readonly updatedAt: string;
  readonly header: Readonly<Record<string, string | null>>;
  readonly lines: readonly {
    readonly rateCode: string | null;
    readonly base: string | null;
    readonly net: string | null;
    readonly included: boolean | null;
    readonly taxAmount: string | null;
    readonly taxType: string | null;
    readonly taxValue: string | null;
    readonly taxConcept: string | null;
  }[];
}

/** Book direction accepted by the legacy source reader. */
export type LegacyVatReadDirection = "purchase" | "sale";

/** One page from the bounded, authenticated legacy source reader. */
export interface LegacyVatSourcePage {
  readonly documents: readonly LegacyVatSourceRecord[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

/** Authorized read port for historical commercial documents awaiting explicit review. */
export interface LegacyVatSourceReader {
  /**
   * Reads a company-scoped source page under the caller's book permission.
   * @param input - Owner scope, actor, direction, date bounds, keyset cursor, and page limit.
   * @returns Raw source data with currency and tax amounts preserved as exact decimal strings.
   * @throws {Error} When source access or query validation fails.
   */
  readLegacyVatSources(input: {
    readonly scope: TaxReportingScope;
    readonly actorId: string;
    readonly direction: LegacyVatReadDirection;
    readonly from: string;
    readonly to: string;
    readonly cursor: string | null;
    readonly limit: number;
  }): Promise<LegacyVatSourcePage>;
}
