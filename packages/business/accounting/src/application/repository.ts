import type {
  AccountingScope,
  ChartOfAccounts,
  LedgerAccountReadModel,
} from "../domain";
import type {
  AccountReferences,
  AccountingCommandResult,
  AccountingWriteCommand,
  FindAccountsQuery,
  GetAccountQuery,
  ListChartsQuery,
} from "./commands";

/** Transactional persistence boundary for all P1 accounting writes. */
export interface AccountingCommandRepository {
  /**
   * Commits a validated command, its audit event and idempotency receipt atomically.
   * @param scope - Trusted scope from an authenticated boundary.
   * @param command - Validated immutable command payload.
   * @returns Durable receipt or an identical prior receipt.
   * @throws {AccountingFailure} When tenant access, concurrency, or invariants reject the operation.
   */
  execute(
    scope: AccountingScope,
    command: AccountingWriteCommand,
  ): Promise<AccountingCommandResult>;
}
/** Read boundary for chart and account queries. */
export interface AccountingQueryRepository {
  /** Lists chart metadata visible to the acting company.
   * @param query - Authorized company chart filter.
   * @returns Matching charts.
   * @throws {AccountingFailure} When access or persistence fails. */
  listCharts(query: ListChartsQuery): Promise<readonly ChartOfAccounts[]>;
  /** Reads an account and its deletion-relevant dependencies.
   * @param query - Authorized account lookup.
   * @returns Account and references, or null.
   * @throws {AccountingFailure} When persistence fails. */
  getAccount(query: GetAccountQuery): Promise<{
    readonly account: LedgerAccountReadModel;
    readonly references: AccountReferences;
  } | null>;
  /** Searches account codes and names in one chart.
   * @param query - Authorized account search.
   * @returns Accounts matching code or name.
   * @throws {AccountingFailure} When persistence fails. */
  findAccounts(query: FindAccountsQuery): Promise<readonly LedgerAccountReadModel[]>;
}
/** Permission boundary for portable accounting operations. */
export interface AccountingAuthorization {
  /** Authorizes the actor against the requested company permission.
   * @param scope - Trusted acting scope.
   * @param operation - Required permission.
   * @returns Nothing after authorization.
   * @throws {AccountingFailure} When the actor lacks permission. */
  require(
    scope: AccountingScope,
    operation: "accounting.read" | "accounting.chart.manage",
  ): Promise<void>;
}
