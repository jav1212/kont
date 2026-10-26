import { accountingScope, AccountingFailure } from "../domain";
import type {
  FindAccountsQuery,
  GetAccountQuery,
  ListChartsQuery,
} from "./commands";
import type {
  AccountingAuthorization,
  AccountingQueryRepository,
} from "./repository";

/** Executes authorized accounting read operations. */
export class AccountingQueries {
  /**
   * Binds scoped query authorization and read persistence.
   * @param authorization - Permission boundary for account reads.
   * @param repository - Read port for charts and accounts.
   * @returns A configured accounting query service.
   * @throws Never during construction.
   */
  public constructor(
    private readonly authorization: AccountingAuthorization,
    private readonly repository: AccountingQueryRepository,
  ) {}
  /** Lists charts after validating their lifecycle filter.
   * @param query - Chart query.
   * @returns Charts visible to the scoped company.
   * @throws {AccountingFailure} When access or persistence fails. */
  public async listCharts(
    query: ListChartsQuery,
  ): ReturnType<AccountingQueryRepository["listCharts"]> {
    const scope = accountingScope(query);
    if (
      query.status !== undefined &&
      query.status !== "draft" &&
      query.status !== "active" &&
      query.status !== "archived"
    )
      throw new AccountingFailure("INVALID", "The chart status is invalid.");
    await this.authorization.require(scope, "accounting.read");
    return readResult(() => this.repository.listCharts(query));
  }
  /** Reads scoped account details and dependency counts.
   * @param query - Account detail query.
   * @returns Detail or null.
   * @throws {AccountingFailure} When access or persistence fails. */
  public async getAccount(
    query: GetAccountQuery,
  ): ReturnType<AccountingQueryRepository["getAccount"]> {
    const scope = accountingScope(query);
    identifier(query.accountId, "Account id");
    await this.authorization.require(scope, "accounting.read");
    return readResult(() => this.repository.getAccount(query));
  }
  /** Finds scoped accounts using validated search filters.
   * @param query - Code/name search query.
   * @returns Matching accounts.
   * @throws {AccountingFailure} When access or persistence fails. */
  public async findAccounts(
    query: FindAccountsQuery,
  ): ReturnType<AccountingQueryRepository["findAccounts"]> {
    const scope = accountingScope(query);
    if (query.chartId !== null) identifier(query.chartId, "Chart id");
    if (
      query.includeInactive !== undefined &&
      typeof query.includeInactive !== "boolean"
    )
      throw new AccountingFailure(
        "INVALID",
        "The include inactive filter is invalid.",
      );
    if (
      query.search !== undefined &&
      (typeof query.search !== "string" || query.search.trim().length > 128)
    )
      throw new AccountingFailure("INVALID", "The account search is invalid.");
    await this.authorization.require(scope, "accounting.read");
    return readResult(() => this.repository.findAccounts(query));
  }
}
function identifier(value: unknown, label: string): void {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 256)
    throw new AccountingFailure("INVALID", `${label} is invalid.`);
}

async function readResult<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (cause: unknown) {
    if (cause instanceof AccountingFailure) throw cause;
    throw new AccountingFailure(
      "UNAVAILABLE",
      "Accounting read persistence is unavailable.",
      { cause },
    );
  }
}
