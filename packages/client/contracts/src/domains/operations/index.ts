export interface ExchangeRateSnapshotDto {
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly value: string;
  readonly effectiveDate: string;
  readonly capturedAt: string;
  readonly source:
    | {
        readonly kind: "official";
        readonly authority: string;
        readonly reference: string | null;
      }
    | { readonly kind: "manual"; readonly reason: string };
}

export interface OperationalDefaultsDto {
  readonly effectiveDate: string;
  readonly presentationCurrency: string;
  readonly exchangeRate:
    | { readonly status: "resolved"; readonly value: ExchangeRateSnapshotDto }
    | { readonly status: "unavailable"; readonly effectiveDate: string };
  readonly version: number;
  readonly updatedAt: string;
}

export interface UpdateOperationalDefaultsDto {
  readonly expectedVersion: number;
  readonly effectiveDate?: string;
  readonly presentationCurrency?: string;
  readonly manualExchangeRate?: {
    readonly baseCurrency: string;
    readonly value: string;
    readonly reason: string;
  };
}

export interface RefreshOperationalExchangeRateDto {
  readonly expectedVersion: number;
}

export interface ExchangeRateSetDto {
  readonly requestedDate: string;
  readonly effectiveDate: string;
  readonly resolution: "exact_date" | "previous_available_date";
  readonly observedAt: string;
  readonly rates: readonly ExchangeRateSnapshotDto[];
}

/** Application-facing port for company operational defaults and exchange rates. */
export interface OperationContextPort {
  /** @param organizationId - Owning organization. @param companyId - Operational company. @returns Operational defaults. */
  get(
    organizationId: string,
    companyId: string,
  ): Promise<OperationalDefaultsDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param command - Versioned update. @returns Updated defaults. */
  update(
    organizationId: string,
    companyId: string,
    command: UpdateOperationalDefaultsDto,
  ): Promise<OperationalDefaultsDto>;
  /** @param organizationId - Owning organization. @param companyId - Operational company. @param date - Effective date. @returns Resolved rates. */
  exchangeRates(
    organizationId: string,
    companyId: string,
    date: string,
  ): Promise<ExchangeRateSetDto>;
}
