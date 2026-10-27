import type {
  AccountKind,
  AccountType,
  AccountingScope,
  ChartStatus,
  CodeStructure,
  MonetaryClass,
  NormalBalance,
} from "../domain";

/** Replay and causality envelope required by every accounting write. */
export interface AccountingCommandEnvelope extends AccountingScope {
  readonly idempotencyKey: string;
  readonly correlationId: string;
}
/** Durable result returned after a command commits or replays an identical receipt. */
export interface AccountingCommandResult {
  readonly commandId: string;
  readonly replayed: boolean;
  readonly affectedIds: readonly string[];
  readonly versions: Readonly<Record<string, number>>;
}
/** One reference discovered before destructive or structural changes. */
export interface AccountReferences {
  readonly postings: number;
  readonly children: number;
  readonly integrationRules: number;
  readonly specialRoles: number;
  readonly associations: number;
}
/** Account data accepted when a chart is created from a copy or imported file. */
export interface InitialAccountInput {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly accountKind: AccountKind;
  readonly accountType: AccountType;
  readonly isMemorandum?: boolean;
  readonly normalBalance?: NormalBalance;
  readonly normalBalanceOverrideReason?: string;
  readonly monetaryClass?: MonetaryClass | null;
}
/** Provenance retained for a chart generated from a reusable source. */
export type ChartCreationSource =
  | { readonly kind: "empty" }
  | {
      readonly kind: "copy";
      readonly sourceChartId: string;
      readonly accountIds: Readonly<Record<string, string>>;
    }
  | { readonly kind: "import"; readonly format: "meister_txt" | "custom_csv" }
  | { readonly kind: "template"; readonly templateId: string };
/** Full P1 command language covering CON-001 through CON-017. */
export type AccountingWriteCommand =
  | CreateChartCommand
  | ChangeChartStructureCommand
  | ActivateChartCommand
  | ArchiveChartCommand
  | CreateAccountCommand
  | AssignAccountToChartCommand
  | UpdateAccountCommand
  | RecodeAccountCommand
  | SetAccountActiveCommand
  | DeleteAccountCommand
  | ConvertAccountKindCommand
  | SetAccountClassificationCommand
  | PairMemorandumAccountsCommand
  | UnpairMemorandumAccountsCommand;
/** CON-001 creates an empty draft chart. */
export interface CreateChartCommand extends AccountingCommandEnvelope {
  readonly kind: "create_chart";
  readonly chartId: string;
  readonly name: string;
  readonly structure: CodeStructure;
  readonly source?: ChartCreationSource;
  readonly initialAccounts?: readonly InitialAccountInput[];
}
/** CON-002 changes a draft or nonconforming-safe chart structure. */
export interface ChangeChartStructureCommand extends AccountingCommandEnvelope {
  readonly kind: "change_chart_structure";
  readonly chartId: string;
  readonly expectedVersion: number;
  readonly structure: CodeStructure;
}
/** CON-001 activates one chart, archiving the previous active chart only when persistence permits it. */
export interface ActivateChartCommand extends AccountingCommandEnvelope {
  readonly kind: "activate_chart";
  readonly chartId: string;
  readonly expectedVersion: number;
}
/** Archives a non-active chart while retaining its history. */
export interface ArchiveChartCommand extends AccountingCommandEnvelope {
  readonly kind: "archive_chart";
  readonly chartId: string;
  readonly expectedVersion: number;
}
/** CON-003, CON-008 and CON-009 create one account. */
export interface CreateAccountCommand extends AccountingCommandEnvelope {
  readonly kind: "create_account";
  readonly accountId: string;
  readonly chartId: string;
  readonly code: string;
  readonly name: string;
  readonly accountKind: AccountKind;
  readonly accountType: AccountType;
  readonly isMemorandum: boolean;
  readonly normalBalance?: NormalBalance;
  readonly normalBalanceOverrideReason?: string;
  readonly monetaryClass: MonetaryClass | null;
}
/** Moves an existing legacy account into a same-company chart without changing its id or code. */
export interface AssignAccountToChartCommand extends AccountingCommandEnvelope {
  readonly kind: "assign_account_to_chart";
  readonly accountId: string;
  readonly expectedVersion: number;
  readonly chartId: string;
}
/** CON-005 changes only fields that do not change an account's identity or code. */
export interface UpdateAccountCommand extends AccountingCommandEnvelope {
  readonly kind: "update_account";
  readonly accountId: string;
  readonly expectedVersion: number;
  readonly name: string;
  readonly accountKind?: AccountKind;
  readonly accountType?: AccountType;
  readonly isMemorandum?: boolean;
  readonly normalBalance?: NormalBalance;
  readonly normalBalanceOverrideReason?: string;
  readonly monetaryClass?: MonetaryClass | null;
}
/** D7 explicitly changes an account code while preserving its identifier and postings. */
export interface RecodeAccountCommand extends AccountingCommandEnvelope {
  readonly kind: "recode_account";
  readonly accountId: string;
  readonly expectedVersion: number;
  readonly code: string;
}
/** CON-006 inactivates or reactivates an account subject to its hierarchy and references. */
export interface SetAccountActiveCommand extends AccountingCommandEnvelope {
  readonly kind: "set_account_active";
  readonly accountId: string;
  readonly expectedVersion: number;
  readonly isActive: boolean;
}
/** CON-007 removes an account only when no dependency remains. */
export interface DeleteAccountCommand extends AccountingCommandEnvelope {
  readonly kind: "delete_account";
  readonly accountId: string;
  readonly expectedVersion: number;
}
/** CON-008 and CON-009 convert an account after checking postings or children. */
export interface ConvertAccountKindCommand extends AccountingCommandEnvelope {
  readonly kind: "convert_account_kind";
  readonly accountId: string;
  readonly expectedVersion: number;
  readonly accountKind: AccountKind;
}
/** CON-010 through CON-017 assign inherited account classifications. */
export interface SetAccountClassificationCommand extends AccountingCommandEnvelope {
  readonly kind: "set_account_classification";
  readonly accountId: string;
  readonly expectedVersion: number;
  readonly accountType: AccountType;
  readonly isMemorandum: boolean;
  readonly normalBalance?: NormalBalance;
  readonly normalBalanceOverrideReason?: string;
  readonly monetaryClass: MonetaryClass | null;
}
/** Query filter for code/name account lookup under an authorized chart. */
export interface FindAccountsQuery extends AccountingScope {
  /** A null chart selects existing unassigned accounts for review and migration. */
  readonly chartId: string | null;
  readonly search?: string;
  readonly includeInactive?: boolean;
}
/** Query describing one account and its deletion-relevant references. */
export interface GetAccountQuery extends AccountingScope {
  readonly accountId: string;
}
/** Query describing charts owned by one company. */
export interface ListChartsQuery extends AccountingScope {
  readonly status?: ChartStatus;
}

/** Links two opposite-nature memorandum detail accounts without changing their identities. */
export interface PairMemorandumAccountsCommand extends AccountingCommandEnvelope {
  readonly kind: "pair_memorandum_accounts";
  readonly debitAccountId: string;
  readonly debitExpectedVersion: number;
  readonly creditAccountId: string;
  readonly creditExpectedVersion: number;
}

/** Removes both reciprocal links in a draft or archived chart before changing either account's classification. */
export interface UnpairMemorandumAccountsCommand extends AccountingCommandEnvelope {
  readonly kind: "unpair_memorandum_accounts";
  readonly accountId: string;
  readonly expectedVersion: number;
  readonly counterpartExpectedVersion: number;
}
