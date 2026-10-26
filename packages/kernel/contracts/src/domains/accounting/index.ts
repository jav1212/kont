/** Scope-free accounting command; the server derives the tenant and actor. */
export type AccountingCommandRequest = Readonly<Record<string, unknown>> & {
  readonly kind: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};

/** Scope-free accounting query sent through the authenticated client API. */
export type AccountingQueryRequest = Readonly<Record<string, unknown>> & {
  readonly kind: string;
};

/** Durable result returned after an accounting command commits or replays. */
export interface AccountingCommandReceiptDto {
  readonly commandId: string;
  readonly replayed: boolean;
  readonly affectedIds: readonly string[];
  readonly versions: Readonly<Record<string, number>>;
}

/** JSON read model returned by one accounting query kind. */
export type AccountingQueryResultDto =
  | Readonly<Record<string, unknown>>
  | readonly Readonly<Record<string, unknown>>[]
  | null;

/** Renderer-neutral boundary for the portable accounting capability. */
export interface AccountingPort {
  /**
   * Executes one idempotent accounting write in the selected organization and company.
   * @param organizationId - Organization resolved by the authenticated client.
   * @param companyId - Company resolved by the authenticated client.
   * @param request - Scope-free accounting command.
   * @returns Durable command receipt with affected identifiers and versions.
   * @throws When transport, authorization, validation, or persistence fails.
   */
  command(organizationId: string, companyId: string, request: AccountingCommandRequest): Promise<AccountingCommandReceiptDto>;
  /**
   * Executes one authorized accounting read for the selected company.
   * @param organizationId - Organization resolved by the authenticated client.
   * @param companyId - Company resolved by the authenticated client.
   * @param request - Scope-free accounting query.
   * @returns The decoded JSON read model for the requested query kind.
   * @throws When transport, authorization, or response validation fails.
   */
  query(organizationId: string, companyId: string, request: AccountingQueryRequest): Promise<AccountingQueryResultDto>;
}
