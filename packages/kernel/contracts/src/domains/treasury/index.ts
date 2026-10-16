import type { TreasuryCommandRequest, TreasuryQueryRequest, TreasuryReadRow } from "@kontave/treasury/contracts";

export type { TreasuryCommandRequest, TreasuryQueryRequest, TreasuryReadRow } from "@kontave/treasury/contracts";

/** Serializable command receipt returned after an authorized treasury write. */
export interface TreasuryCommandReceiptDto {
  readonly commandId: string;
  readonly replayed: boolean;
  readonly affectedIds: readonly string[];
  readonly versions: Readonly<Record<string, number>>;
}

/** Stable page envelope containing the validated Treasury read-model row union. */
export interface TreasuryPageDto {
  readonly items: readonly TreasuryReadRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly asOf: string;
}

/** Renderer-neutral treasury boundary. The server derives all operational scope from the route and session. */
export interface TreasuryPort {
  /**
   * Sends one idempotent treasury write command in an organization/company route scope.
   * @param organizationId - Organization resolved by the authenticated client.
   * @param companyId - Company resolved by the authenticated client.
   * @param request - Scope-free serializable treasury command.
   * @returns The durable command receipt.
   * @throws When the transport, authorization, or response contract fails.
   */
  command(organizationId: string, companyId: string, request: TreasuryCommandRequest): Promise<TreasuryCommandReceiptDto>;
  /**
   * Reads one authorized treasury page in an organization/company route scope.
   * @param organizationId - Organization resolved by the authenticated client.
   * @param companyId - Company resolved by the authenticated client.
   * @param request - Scope-free serializable treasury query.
   * @returns The validated page envelope with lossless JSON item values.
   * @throws When the transport, authorization, or response contract fails.
   */
  query(organizationId: string, companyId: string, request: TreasuryQueryRequest): Promise<TreasuryPageDto>;
}
