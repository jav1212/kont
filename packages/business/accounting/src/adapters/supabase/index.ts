import {
  accountingScope,
  AccountingFailure,
  type AccountingScope,
  type ChartOfAccounts,
  type LedgerAccountReadModel,
  type MonetaryClass,
} from "../../domain";
import type {
  AccountingCommandResult,
  AccountingWriteCommand,
  FindAccountsQuery,
  GetAccountQuery,
  ListChartsQuery,
} from "../../application";
import type {
  AccountingCommandRepository,
  AccountingQueryRepository,
} from "../../application";

/** Structural subset of a Supabase client required by the accounting adapter. */
export interface AccountingSupabaseClient {
  /** Binds the portable accounting ports to one trusted server RPC client.
   * Invokes a registered SQL RPC with JSON-compatible arguments.
   * @param functionName - Registered SQL function name.
   * @param argumentsValue - JSON-compatible RPC arguments.
   * @returns RPC data with an optional PostgREST error.
   * @throws Transport failures may reject the returned promise.
   */
  rpc(
    functionName:
      | "shared_accounting_execute_command"
      | "shared_accounting_query",
    argumentsValue: Readonly<Record<string, unknown>>,
  ): PromiseLike<{
    readonly data: unknown;
    readonly error: {
      readonly message?: string;
      readonly code?: string;
    } | null;
  }>;
}

/** Adapts the portable accounting ports to the shared Supabase accounting RPCs. */
export class SupabaseAccountingRepository
  implements AccountingCommandRepository, AccountingQueryRepository
{
  /**
   * @param client - Trusted server-side client permitted to invoke shared accounting RPCs.
   * @returns A repository bound to the supplied RPC client.
   * @throws {AccountingFailure} When the client is absent.
   */
  public constructor(private readonly client: AccountingSupabaseClient) {
    if (!client)
      throw new AccountingFailure(
        "INVALID",
        "An accounting Supabase client is required.",
      );
  }

  /** {@inheritDoc AccountingCommandRepository.execute} */
  public async execute(
    scope: AccountingScope,
    command: AccountingWriteCommand,
  ): Promise<AccountingCommandResult> {
    accountingScope(scope);
    const raw = await this.call(
      "shared_accounting_execute_command",
      { p_scope: scope, p_command: command },
      "command",
    );
    return decodeCommandResult(raw);
  }

  /** {@inheritDoc AccountingQueryRepository.listCharts} */
  public async listCharts(
    query: ListChartsQuery,
  ): Promise<readonly ChartOfAccounts[]> {
    const scope = queryScope(query);
    const raw = await this.call(
      "shared_accounting_query",
      {
        p_scope: scope,
        p_query: { kind: "list_charts", status: query.status ?? null },
      },
      "query",
    );
    const rows = queryRows(raw);
    return rows.map(decodeChart);
  }

  /** {@inheritDoc AccountingQueryRepository.getAccount} */
  public async getAccount(query: GetAccountQuery): Promise<{
    readonly account: LedgerAccountReadModel;
    readonly references: {
      readonly postings: number;
      readonly children: number;
      readonly integrationRules: number;
      readonly specialRoles: number;
      readonly associations: number;
    };
  } | null> {
    const scope = queryScope(query);
    const raw = await this.call(
      "shared_accounting_query",
      {
        p_scope: scope,
        p_query: { kind: "get_account", accountId: query.accountId },
      },
      "query",
    );
    if (raw === null) return null;
    const result = record(raw, "Accounting account response");
    if (field(result, "account") === null) return null;
    return {
      account: decodeAccount(field(result, "account")),
      references: decodeReferences(field(result, "references")),
    };
  }

  /** {@inheritDoc AccountingQueryRepository.findAccounts} */
  public async findAccounts(
    query: FindAccountsQuery,
  ): Promise<readonly LedgerAccountReadModel[]> {
    const scope = queryScope(query);
    const raw = await this.call(
      "shared_accounting_query",
      {
        p_scope: scope,
        p_query: {
          kind: "find_accounts",
          chartId: query.chartId,
          search: query.search ?? null,
          includeInactive: query.includeInactive ?? false,
        },
      },
      "query",
    );
    return queryRows(raw).map(decodeAccount);
  }

  /** Calls SQL and translates every transport or SQL error into the accounting failure vocabulary.
   * @param functionName - Shared accounting RPC to invoke.
   * @param argumentsValue - Serialized RPC parameters.
   * @param operation - Operation name used in unavailable failures.
   * @returns Raw JSON RPC payload.
   * @throws {AccountingFailure} When SQL rejects the scope or the RPC is unavailable.
   */
  private async call(
    functionName:
      | "shared_accounting_execute_command"
      | "shared_accounting_query",
    argumentsValue: Readonly<Record<string, unknown>>,
    operation: "command" | "query",
  ): Promise<unknown> {
    try {
      const response = await this.client.rpc(functionName, argumentsValue);
      if (response.error) throw sqlFailure(response.error);
      return response.data;
    } catch (cause: unknown) {
      if (cause instanceof AccountingFailure) throw cause;
      throw new AccountingFailure(
        "UNAVAILABLE",
        `The accounting ${operation} service is unavailable.`,
        { cause: cause instanceof Error ? cause : undefined },
      );
    }
  }
}

function decodeCommandResult(value: unknown): AccountingCommandResult {
  const result = record(value, "Accounting command response");
  const commandId = text(field(result, "commandId"), "commandId");
  const replayed = field(result, "replayed");
  const affectedIds = field(result, "affectedIds");
  const versions = field(result, "versions");
  if (
    typeof replayed !== "boolean" ||
    !Array.isArray(affectedIds) ||
    !affectedIds.every(
      (value) => typeof value === "string" && value.length > 0,
    ) ||
    !versionRecord(versions)
  )
    malformed("Accounting command response");
  return { commandId, replayed, affectedIds, versions };
}

function queryRows(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  const response = record(value, "Accounting query response");
  const rows = field(response, "rows") ?? field(response, "items");
  if (!Array.isArray(rows)) malformed("Accounting query response");
  return rows;
}

function decodeChart(value: unknown): ChartOfAccounts {
  const row = record(value, "Accounting chart");
  const status = enumValue(
    field(row, "status"),
    ["draft", "active", "archived"] as const,
    "chart status",
  );
  const structureValue = field(row, "structure");
  const structure = record(structureValue, "Accounting chart structure");
  const segments = field(structure, "segments");
  if (!Array.isArray(segments)) malformed("Accounting chart structure");
  return {
    id: text(field(row, "id"), "chart id"),
    companyId: text(field(row, "companyId"), "chart companyId"),
    name: text(field(row, "name"), "chart name"),
    status,
    structure: { segments: segments.map(decodeSegment) },
    version: version(field(row, "version"), "chart version"),
  };
}

function decodeSegment(
  value: unknown,
  index: number,
): { readonly length: number; readonly separator: string | null } {
  const segment = record(value, "Accounting chart segment");
  const length = field(segment, "length");
  const separator = field(segment, "separator");
  if (
    !Number.isSafeInteger(length) ||
    (length as number) < 1 ||
    (length as number) > 30 ||
    (index === 0
      ? separator !== null
      : typeof separator !== "string" || !/^[.\-/]$/.test(separator))
  )
    malformed("Accounting chart segment");
  return { length: length as number, separator: separator as string | null };
}

/** Decodes a persisted account without imposing a new chart mask on legacy rows. */
function decodeAccount(value: unknown): LedgerAccountReadModel {
  const row = record(value, "Accounting account");
  const chartId = field(row, "chartId");
  const monetaryClass = field(row, "monetaryClass");
  const override = field(row, "normalBalanceOverrideReason");
  const counterpart = field(row, "memorandumCounterpartId");
  const historicalOpeningBalance = field(row, "historicalOpeningBalance");
  if (chartId !== null && typeof chartId !== "string")
    malformed("Accounting account chartId");
  if (
    monetaryClass !== null &&
    monetaryClass !== "monetary" &&
    monetaryClass !== "non_monetary"
  )
    malformed("Accounting account monetaryClass");
  if (
    override !== undefined &&
    override !== null &&
    typeof override !== "string"
  )
    malformed("Accounting account normalBalanceOverrideReason");
  if (
    counterpart !== undefined &&
    counterpart !== null &&
    typeof counterpart !== "string"
  )
    malformed("Accounting account memorandumCounterpartId");
  if (
    historicalOpeningBalance !== undefined &&
    historicalOpeningBalance !== null &&
    (typeof historicalOpeningBalance !== "string" ||
      !/^-?\d+(?:\.\d+)?$/.test(historicalOpeningBalance))
  )
    malformed("Accounting account historicalOpeningBalance");
  const parentCode = field(row, "parentCode");
  if (parentCode !== null && typeof parentCode !== "string")
    malformed("Accounting account parentCode");
  const level = field(row, "level");
  if (!Number.isSafeInteger(level) || (level as number) < 1)
    malformed("Accounting account level");
  const account: LedgerAccountReadModel = {
    id: text(field(row, "id"), "account id"),
    chartId,
    code: text(field(row, "code"), "account code"),
    name: text(field(row, "name"), "account name"),
    parentCode: parentCode as string | null,
    level: level as number,
    kind: enumValue(
      field(row, "kind"),
      ["detail", "summary"] as const,
      "account kind",
    ),
    type: enumValue(
      field(row, "type"),
      ["asset", "liability", "equity", "revenue", "expense"] as const,
      "account type",
    ),
    isMemorandum: booleanField(row, "isMemorandum"),
    normalBalance: enumValue(
      field(row, "normalBalance"),
      ["debit", "credit"] as const,
      "account normalBalance",
    ),
    monetaryClass: monetaryClass as MonetaryClass | null,
    isActive: booleanField(row, "isActive"),
    version: version(field(row, "version"), "account version"),
  };
  return {
    ...row,
    ...account,
    ...(typeof override === "string"
      ? { normalBalanceOverrideReason: override }
      : {}),
    ...(typeof counterpart === "string"
      ? { memorandumCounterpartId: counterpart }
      : {}),
    ...(typeof historicalOpeningBalance === "string"
      ? { historicalOpeningBalance }
      : {}),
  } as LedgerAccountReadModel;
}

function decodeReferences(value: unknown): {
  readonly postings: number;
  readonly children: number;
  readonly integrationRules: number;
  readonly specialRoles: number;
  readonly associations: number;
} {
  const references = record(value, "Accounting account references");
  return {
    postings: count(field(references, "postings"), "postings"),
    children: count(field(references, "children"), "children"),
    integrationRules: count(
      field(references, "integrationRules"),
      "integrationRules",
    ),
    specialRoles: count(field(references, "specialRoles"), "specialRoles"),
    associations: count(field(references, "associations"), "associations"),
  };
}

function sqlFailure(error: {
  readonly message?: string;
  readonly code?: string;
}): AccountingFailure {
  const message = error.message ?? "";
  const known = [
    "INVALID",
    "FORBIDDEN",
    "NOT_FOUND",
    "VERSION_CONFLICT",
    "IDEMPOTENCY_CONFLICT",
    "CODE_OUT_OF_STRUCTURE",
    "DUPLICATE_CODE",
    "PARENT_INVALID",
    "TYPE_MISMATCH",
    "HAS_POSTINGS",
    "HAS_CHILDREN",
    "IN_USE",
    "ACTIVE_CHART_CONFLICT",
  ] as const;
  const candidate = /ACCOUNTING_([A-Z_]+)/.exec(message)?.[1];
  const code = known.find((value) => value === candidate);
  if (code)
    return new AccountingFailure(
      code,
      message || `Accounting ${code.toLowerCase().replaceAll("_", " ")}.`,
    );
  if (
    message.includes("ACCESS_DENIED") ||
    message.includes("ORGANIZATIONAL_USER_ACCESS_DENIED")
  )
    return new AccountingFailure(
      "FORBIDDEN",
      "The actor cannot access this accounting scope.",
    );
  if (error.code === "22023")
    return new AccountingFailure(
      "INVALID",
      "The accounting request is invalid.",
    );
  return new AccountingFailure(
    "UNAVAILABLE",
    "The accounting service is unavailable.",
  );
}

/** Selects only trusted scope fields so query filters never become scope claims. */
function queryScope(query: AccountingScope): AccountingScope {
  return accountingScope({
    tenantId: query.tenantId,
    organizationId: query.organizationId,
    companyId: query.companyId,
    actorId: query.actorId,
  });
}

function field(
  row: Readonly<Record<string, unknown>>,
  camelName: string,
): unknown {
  if (Object.hasOwn(row, camelName)) return row[camelName];
  return row[
    camelName.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)
  ];
}
function record(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    malformed(label);
  return value as Readonly<Record<string, unknown>>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) malformed(label);
  return value;
}
function booleanField(
  row: Readonly<Record<string, unknown>>,
  name: string,
): boolean {
  const value = field(row, name);
  if (typeof value !== "boolean") malformed(name);
  return value;
}
function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) malformed(label);
  return value as number;
}
function version(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) malformed(label);
  return value as number;
}
function versionRecord(
  value: unknown,
): value is Readonly<Record<string, number>> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (item) => Number.isSafeInteger(item) && item >= 0,
    )
  );
}
function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (
    typeof value === "string" &&
    (values as readonly string[]).includes(value)
  )
    return value as T;
  malformed(label);
}
function malformed(label: string): never {
  throw new AccountingFailure("UNAVAILABLE", `${label} is malformed.`);
}
