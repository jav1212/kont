export interface OfficialExchangeRateDto {
  readonly code: string;
  readonly value: number;
  readonly effectiveDate: string;
  readonly percentageChange: number | null;
}

export interface OfficialExchangeRateSetDto {
  readonly effectiveDate: string;
  readonly rates: readonly OfficialExchangeRateDto[];
}

/** Application-facing port for official company-scoped exchange rates. */
export interface OfficialExchangeRatesPort {
  /**
   * Resolves official rates for an operational company.
   * @param organizationId - Active workspace organization.
   * @param companyId - Active operational company.
   * @param date - Requested local date in YYYY-MM-DD format.
   * @returns Official rates quoted in VES.
   */
  current(
    organizationId: string,
    companyId: string,
    date?: string,
  ): Promise<OfficialExchangeRateSetDto>;
}
