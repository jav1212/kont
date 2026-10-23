/** Scope-free payables command; the server derives tenant, organization, company and actor. */
export type PayablesCommandRequest = Readonly<Record<string, unknown>> & {
  readonly kind: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};

/** Scope-free payables report request: a report kind and its filters. */
export type PayablesQueryRequest = Readonly<Record<string, unknown>> & { readonly kind: string };

/** Serializable receipt returned after an authorized payables write. */
export interface PayablesCommandReceiptDto {
  readonly commandId: string;
  readonly replayed: boolean;
  readonly affectedIds: readonly string[];
  readonly versions: Readonly<Record<string, number>>;
  readonly warnings?: readonly Readonly<Record<string, string>>[];
  readonly checkNumber?: string | null;
}

/** One report page; monetary values stay exact decimal strings. */
export interface PayablesReportDto {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly total: number;
  readonly asOf?: string;
  readonly totals?: readonly Readonly<Record<string, unknown>>[];
  readonly rulesActive?: boolean;
}

/** Renderer-neutral Accounts Payable boundary over the authenticated client API. */
export interface PayablesPort {
  /**
   * Sends one idempotent payables command in an organization/company route scope.
   * @param organizationId - Organization resolved by the authenticated client.
   * @param companyId - Company resolved by the authenticated client.
   * @param request - Scope-free serializable payables command.
   * @returns The durable command receipt.
   * @throws When the transport, authorization or response contract fails.
   */
  command(organizationId: string, companyId: string, request: PayablesCommandRequest): Promise<PayablesCommandReceiptDto>;
  /**
   * Reads one authorized payables report in an organization/company route scope.
   * @param organizationId - Organization resolved by the authenticated client.
   * @param companyId - Company resolved by the authenticated client.
   * @param request - Scope-free report kind and filters.
   * @returns The validated report page.
   * @throws When the transport, authorization or response contract fails.
   */
  query(organizationId: string, companyId: string, request: PayablesQueryRequest): Promise<PayablesReportDto>;
}
