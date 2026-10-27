import {
  accountingScope,
  AccountingFailure,
  codeStructure,
  normalizeCode,
} from "../domain";
import type {
  AccountingCommandResult,
  AccountingWriteCommand,
} from "./commands";
import type {
  AccountingAuthorization,
  AccountingCommandRepository,
} from "./repository";

/** Executes a validated P1 accounting write through its transactional port. */
export class ExecuteAccountingCommand {
  /**
   * Binds authorization and persistence without taking ownership of either dependency.
   * @param authorization - Permission boundary evaluated before every write and replay.
   * @param repository - Port responsible for atomic persistence and idempotency.
   * @returns A configured command use case.
   * @throws Never during construction.
   */
  public constructor(
    private readonly authorization: AccountingAuthorization,
    private readonly repository: AccountingCommandRepository,
  ) {}
  /**
   * Validates, authorizes and persists one accounting command.
   * @param command - Complete idempotent accounting operation.
   * @returns Durable command receipt.
   * @throws {AccountingFailure} When validation, authorization, concurrency, or persistence rejects the command.
   */
  public async execute(
    command: AccountingWriteCommand,
  ): Promise<AccountingCommandResult> {
    command = structuredClone(command);
    const scope = accountingScope(command);
    validateEnvelope(command);
    validateCommand(command);
    try {
      await this.authorization.require(scope, "accounting.chart.manage");
      return await this.repository.execute(scope, command);
    } catch (cause: unknown) {
      if (cause instanceof AccountingFailure) throw cause;
      throw new AccountingFailure(
        "UNAVAILABLE",
        "Accounting persistence is unavailable.",
        { cause },
      );
    }
  }
}

/** Validates the command payload before a persistence adapter obtains locks.
 * @param command - Candidate P1 accounting command.
 * @returns Nothing after validation.
 * @throws {AccountingFailure} When a portable invariant is violated.
 */
export function validateAccountingCommand(
  command: AccountingWriteCommand,
): void {
  accountingScope(command);
  validateEnvelope(command);
  validateCommand(command);
}
function validateEnvelope(command: AccountingWriteCommand): void {
  text(command.idempotencyKey, "Idempotency key", 128);
  text(command.correlationId, "Correlation id", 128);
}
function validateCommand(command: AccountingWriteCommand): void {
  switch (command.kind) {
    case "create_chart":
      text(command.chartId, "Chart id");
      text(command.name, "Chart name");
      codeStructure(command.structure);
      if (
        command.source !== undefined &&
        (!command.source ||
          typeof command.source !== "object" ||
          !["empty", "copy", "import", "template"].includes(
            command.source.kind,
          ))
      )
        invalid("Chart source is invalid.");
      if (
        command.initialAccounts !== undefined &&
        !Array.isArray(command.initialAccounts)
      )
        invalid("Imported accounts must be an array.");
      if (
        command.source?.kind === "import" &&
        !["meister_txt", "custom_csv"].includes(command.source.format)
      )
        invalid("Import format is invalid.");
      if (command.source?.kind === "copy") {
        if (
          !command.source.accountIds ||
          typeof command.source.accountIds !== "object" ||
          Array.isArray(command.source.accountIds)
        )
          invalid("A copy requires an account identity map.");
        text(command.source.sourceChartId, "Source chart id");
        if (command.initialAccounts)
          invalid("A copied chart cannot also include imported accounts.");
        for (const [sourceId, targetId] of Object.entries(
          command.source.accountIds,
        )) {
          text(sourceId, "Source account id");
          text(targetId, "Target account id");
        }
      } else if (command.source?.kind === "template")
        invalid("No accounting template is installed.");
      else if (command.source?.kind === "empty" && command.initialAccounts)
        invalid("An empty chart cannot include imported accounts.");
      if (command.initialAccounts && command.initialAccounts.length > 10_000)
        invalid("A chart import has too many accounts.");
      for (const account of command.initialAccounts ?? []) {
        if (!account || typeof account !== "object")
          invalid("Imported account is invalid.");
        text(account.id, "Imported account id");
        text(account.name, "Imported account name");
        normalizeCode(account.code);
        kind(account.accountKind);
        type(account.accountType);
        monetary(account.monetaryClass ?? null);
        normal(account.normalBalance);
      }
      return;
    case "change_chart_structure":
      text(command.chartId, "Chart id");
      version(command.expectedVersion);
      codeStructure(command.structure);
      return;
    case "activate_chart":
    case "archive_chart":
      text(command.chartId, "Chart id");
      version(command.expectedVersion);
      return;
    case "create_account":
      text(command.accountId, "Account id");
      text(command.chartId, "Chart id");
      text(command.name, "Account name");
      kind(command.accountKind);
      type(command.accountType);
      monetary(command.monetaryClass);
      normal(command.normalBalance);
      if (command.normalBalanceOverrideReason !== undefined)
        text(
          command.normalBalanceOverrideReason,
          "Normal balance override reason",
        );
      if (typeof command.isMemorandum !== "boolean")
        invalid("The memorandum flag is invalid.");
      normalizeCode(command.code);
      return;
    case "assign_account_to_chart":
      text(command.accountId, "Account id");
      text(command.chartId, "Chart id");
      version(command.expectedVersion);
      return;
    case "update_account":
      text(command.accountId, "Account id");
      text(command.name, "Account name");
      version(command.expectedVersion);
      if (command.accountKind !== undefined) kind(command.accountKind);
      if (command.accountType !== undefined) type(command.accountType);
      if (
        command.isMemorandum !== undefined &&
        typeof command.isMemorandum !== "boolean"
      )
        invalid("The memorandum flag is invalid.");
      if (command.monetaryClass !== undefined) monetary(command.monetaryClass);
      normal(command.normalBalance);
      if (command.normalBalanceOverrideReason !== undefined)
        text(
          command.normalBalanceOverrideReason,
          "Normal balance override reason",
        );
      return;
    case "recode_account":
      text(command.accountId, "Account id");
      version(command.expectedVersion);
      normalizeCode(command.code);
      return;
    case "set_account_active":
      text(command.accountId, "Account id");
      version(command.expectedVersion);
      if (typeof command.isActive !== "boolean")
        invalid("The account active flag is invalid.");
      return;
    case "delete_account":
      text(command.accountId, "Account id");
      version(command.expectedVersion);
      return;
    case "convert_account_kind":
      text(command.accountId, "Account id");
      version(command.expectedVersion);
      kind(command.accountKind);
      return;
    case "unpair_memorandum_accounts":
      text(command.accountId, "Account id");
      version(command.expectedVersion);
      version(command.counterpartExpectedVersion);
      return;
    case "pair_memorandum_accounts":
      text(command.debitAccountId, "Debit account id");
      text(command.creditAccountId, "Credit account id");
      version(command.debitExpectedVersion);
      version(command.creditExpectedVersion);
      return;
    case "set_account_classification":
      text(command.accountId, "Account id");
      version(command.expectedVersion);
      type(command.accountType);
      monetary(command.monetaryClass);
      normal(command.normalBalance);
      if (command.normalBalanceOverrideReason !== undefined)
        text(
          command.normalBalanceOverrideReason,
          "Normal balance override reason",
        );
      if (typeof command.isMemorandum !== "boolean")
        invalid("The memorandum flag is invalid.");
      return;
    default:
      invalid("Unknown accounting command.");
  }
}
function text(value: unknown, label: string, maximum = 512): void {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  )
    invalid(`${label} is invalid.`);
}
function version(value: unknown): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    invalid("The expected version is invalid.");
}
function kind(value: unknown): void {
  if (value !== "detail" && value !== "summary")
    invalid("The account kind is invalid.");
}
function type(value: unknown): void {
  if (
    !["asset", "liability", "equity", "revenue", "expense"].includes(
      value as string,
    )
  )
    invalid("The account type is invalid.");
}
function monetary(value: unknown): void {
  if (value !== null && value !== "monetary" && value !== "non_monetary")
    invalid("The monetary class is invalid.");
}
function normal(value: unknown): void {
  if (value !== undefined && value !== "debit" && value !== "credit")
    invalid("The normal balance is invalid.");
}
function invalid(message: string): never {
  throw new AccountingFailure("INVALID", message);
}
