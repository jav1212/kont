import {
  accountCodePosition,
  codeStructure,
  normalizeCode,
  type CodeStructure,
} from "./code-structure";
import { AccountingFailure } from "./failure";

/** Tenant-isolated scope carried by each accounting operation. */
export interface AccountingScope {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly actorId: string;
  /** Server-validated delegated calls can bypass direct membership inside the service-only RPC. */
  readonly authorizationMode?: "direct" | "delegated";
}
/** Chart lifecycle. Only one chart may be active for a company. */
export type ChartStatus = "draft" | "active" | "archived";
/** Stable five-way account classification retained for existing consumers. */
export type AccountType =
  "asset" | "liability" | "equity" | "revenue" | "expense";
/** Whether an account accepts postings or aggregates children. */
export type AccountKind = "detail" | "summary";
/** Usual debit or credit sign, optionally overridden for a regulatory account. */
export type NormalBalance = "debit" | "credit";
/** Inflation-adjustment classification. */
export type MonetaryClass = "monetary" | "non_monetary";
/** Immutable chart metadata. */
export interface ChartOfAccounts {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly status: ChartStatus;
  readonly structure: CodeStructure;
  readonly version: number;
}
/** One persisted ledger account and its hierarchy-derived level. */
export interface LedgerAccount {
  readonly id: string;
  readonly chartId: string;
  readonly code: string;
  readonly name: string;
  readonly parentCode: string | null;
  readonly level: number;
  readonly kind: AccountKind;
  readonly type: AccountType;
  readonly isMemorandum: boolean;
  readonly normalBalance: NormalBalance;
  readonly normalBalanceOverrideReason?: string;
  readonly memorandumCounterpartId?: string;
  readonly monetaryClass: MonetaryClass | null;
  readonly isActive: boolean;
  readonly version: number;
}

/** Read projection retaining historical accounts that have not yet been assigned to a chart. */
export interface LedgerAccountReadModel extends Omit<LedgerAccount, "chartId"> {
  readonly chartId: string | null;
  /** Historical VES amount retained verbatim as a decimal string; new writes never change it. */
  readonly historicalOpeningBalance?: string;
}

/** Validates the trusted scope required to isolate a portable accounting operation.
 * @param value - Candidate tenant, organization, company, and actor identifiers.
 * @returns The validated scope.
 * @throws {AccountingFailure} When any identifier is absent or oversized.
 */
export function accountingScope(value: AccountingScope): AccountingScope {
  requireRecord(value);
  for (const id of [
    value.tenantId,
    value.organizationId,
    value.companyId,
    value.actorId,
  ])
    text(id, "Scope identifier", 256);
  return value;
}
/** Builds a chart after validating its name, lifecycle, structure, and revision.
 * @param value - Candidate chart metadata.
 * @returns A normalized chart.
 * @throws {AccountingFailure} When the chart invariant is invalid.
 */
export function chartOfAccounts(value: ChartOfAccounts): ChartOfAccounts {
  requireRecord(value);
  return {
    ...value,
    id: text(value.id, "Chart id"),
    companyId: text(value.companyId, "Company id"),
    name: text(value.name, "Chart name"),
    status: chartStatus(value.status),
    structure: codeStructure(value.structure),
    version: version(value.version),
  };
}
/** Builds an account whose hierarchy is derived from its code rather than stored as user input.
 * @param structure - Owning chart code structure.
 * @param value - Candidate account fields.
 * @returns A normalized account with derived level and parent code.
 * @throws {AccountingFailure} When classification or structural fields are invalid.
 */
export function ledgerAccount(
  structure: CodeStructure,
  value: Omit<
    LedgerAccount,
    "code" | "parentCode" | "level" | "normalBalance"
  > & { readonly code: string; readonly normalBalance?: NormalBalance },
): LedgerAccount {
  requireRecord(value);
  const code = normalizeCode(value.code);
  const position = accountCodePosition(structure, code);
  const type = accountType(value.type);
  const normal =
    value.normalBalance === undefined
      ? normalBalanceFor(type)
      : normalBalance(value.normalBalance);
  if (typeof value.isMemorandum !== "boolean")
    throw invalid("The memorandum flag is invalid.");
  if (typeof value.isActive !== "boolean")
    throw invalid("The account status is invalid.");
  const override =
    value.normalBalanceOverrideReason === undefined
      ? undefined
      : text(
          value.normalBalanceOverrideReason,
          "Normal balance override reason",
        );
  if (!value.isMemorandum && normal !== normalBalanceFor(type) && !override)
    throw invalid("A normal balance override requires an audit reason.");
  return {
    ...value,
    id: text(value.id, "Account id"),
    chartId: text(value.chartId, "Chart id"),
    code,
    name: text(value.name, "Account name"),
    parentCode: position.parentCode,
    level: position.level,
    kind: accountKind(value.kind),
    type,
    isMemorandum: value.isMemorandum,
    normalBalance: normal,
    ...(override === undefined
      ? {}
      : { normalBalanceOverrideReason: override }),
    monetaryClass:
      value.monetaryClass === null ? null : monetaryClass(value.monetaryClass),
    isActive: value.isActive,
    version: version(value.version),
  };
}
/** Gets the default normal balance dictated by the account type.
 * @param type - Stable account type.
 * @returns Debit for assets and expenses, credit for the other types.
 * @throws {AccountingFailure} When the account type is unknown.
 */
export function normalBalanceFor(type: AccountType): NormalBalance {
  return accountType(type) === "asset" || type === "expense"
    ? "debit"
    : "credit";
}
/** Ensures a child classification remains compatible with its parent inheritance.
 * @param parent - Parent summary account.
 * @param child - Candidate child account.
 * @returns The compatible child.
 * @throws {AccountingFailure} When hierarchy, type, memorandum, or monetary class differs.
 */
export function inheritAccountClassification(
  parent: LedgerAccount,
  child: LedgerAccount,
): LedgerAccount {
  if (parent.kind !== "summary" || child.parentCode !== parent.code)
    throw new AccountingFailure(
      "PARENT_INVALID",
      "The parent must be the immediate summary account.",
    );
  if (
    parent.type !== child.type ||
    parent.isMemorandum !== child.isMemorandum ||
    (parent.monetaryClass !== null &&
      child.monetaryClass !== parent.monetaryClass)
  )
    throw new AccountingFailure(
      "TYPE_MISMATCH",
      "Child classification must inherit its parent classification.",
    );
  return child;
}
/** Validates a requested detail-summary conversion against the known posting and child counts.
 * @param account - Existing account.
 * @param nextKind - Requested kind.
 * @param postingCount - Number of journal lines using the account.
 * @param childCount - Number of immediate children.
 * @returns The valid requested kind.
 * @throws {AccountingFailure} When a conversion would invalidate postings or children.
 */
export function accountKindConversion(
  account: LedgerAccount,
  nextKind: AccountKind,
  postingCount: number,
  childCount: number,
): AccountKind {
  const kind = accountKind(nextKind);
  count(postingCount);
  count(childCount);
  if (account.kind === kind) return kind;
  if (kind === "summary" && postingCount > 0)
    throw new AccountingFailure(
      "HAS_POSTINGS",
      "A posted detail account cannot become a summary account.",
    );
  if (kind === "detail" && childCount > 0)
    throw new AccountingFailure(
      "HAS_CHILDREN",
      "A summary account with children cannot become a detail account.",
    );
  return kind;
}
function accountType(value: unknown): AccountType {
  if (
    value === "asset" ||
    value === "liability" ||
    value === "equity" ||
    value === "revenue" ||
    value === "expense"
  )
    return value;
  throw invalid("The account type is invalid.");
}
function accountKind(value: unknown): AccountKind {
  if (value === "detail" || value === "summary") return value;
  throw invalid("The account kind is invalid.");
}
function chartStatus(value: unknown): ChartStatus {
  if (value === "draft" || value === "active" || value === "archived")
    return value;
  throw invalid("The chart status is invalid.");
}
function monetaryClass(value: unknown): MonetaryClass {
  if (value === "monetary" || value === "non_monetary") return value;
  throw invalid("The monetary class is invalid.");
}
function normalBalance(value: unknown): NormalBalance {
  if (value === "debit" || value === "credit") return value;
  throw invalid("The normal balance is invalid.");
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw invalid("The version is invalid.");
  return value as number;
}
function count(value: unknown): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw invalid("A reference count is invalid.");
}
function text(value: unknown, label: string, maximum = 512): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  )
    throw invalid(`${label} is invalid.`);
  return value.trim();
}
function requireRecord(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalid("An accounting value is invalid.");
}
function invalid(message: string): AccountingFailure {
  return new AccountingFailure("INVALID", message);
}
