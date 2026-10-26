import {
  accountCodePosition,
  codeStructure,
  accountKindConversion,
  AccountingFailure,
  chartOfAccounts,
  inheritAccountClassification,
  ledgerAccount,
  normalBalanceFor,
  type AccountingScope,
  type ChartOfAccounts,
  type LedgerAccount,
} from "../domain";
import type {
  AccountReferences,
  AccountingCommandResult,
  AccountingWriteCommand,
  FindAccountsQuery,
  GetAccountQuery,
  ListChartsQuery,
  InitialAccountInput,
} from "./commands";

import type {
  AccountingCommandRepository,
  AccountingQueryRepository,
} from "./repository";
import { validateAccountingCommand } from "./execute-accounting-command";

/** Portable accounting state machine. Hosts supply scoped snapshots and persist accepted results atomically. This engine performs no external I/O. */
export class AccountingCommandEngine
  implements AccountingCommandRepository, AccountingQueryRepository
{
  private readonly charts = new Map<string, ChartOfAccounts>();
  private readonly chartScopes = new Map<string, string>();
  private readonly accounts = new Map<string, LedgerAccount>();
  private readonly references = new Map<string, AccountReferences>();
  private readonly receipts = new Map<
    string,
    { readonly intent: string; readonly result: AccountingCommandResult }
  >();
  /** Audit facts emitted by commands whose historical identity matters. */
  private readonly events: Array<{
    readonly kind: string;
    readonly accountId: string;
    readonly previousCode?: string;
    readonly nextCode?: string;
    readonly reason?: string;
    readonly actorId?: string;
    readonly correlationId?: string;
  }> = [];
  /** Returns detached audit facts emitted by accepted transitions.
   * @returns Immutable audit snapshots.
   * @throws Never. */
  public get auditEvents(): readonly {
    readonly kind: string;
    readonly accountId: string;
    readonly previousCode?: string;
    readonly nextCode?: string;
    readonly reason?: string;
    readonly actorId?: string;
    readonly correlationId?: string;
  }[] {
    return structuredClone(this.events);
  }
  /**
   * Seeds the repository with trusted immutable chart and account snapshots.
   * @param charts - Charts to make available to tests.
   * @param accounts - Accounts belonging to the supplied charts.
   * @param scope - Required owner of nonempty seed snapshots.
   * @returns A repository retaining its own copies of the supplied facts.
   * @throws {AccountingFailure} When a seed violates domain invariants.
   */
  public constructor(
    charts: readonly ChartOfAccounts[] = [],
    accounts: readonly LedgerAccount[] = [],
    scope?: AccountingScope,
  ) {
    if ((charts.length || accounts.length) && !scope)
      throw new AccountingFailure(
        "INVALID",
        "Seed snapshots require their owning scope.",
      );
    for (const chart of charts) {
      this.charts.set(chart.id, structuredClone(chartOfAccounts(chart)));
      if (scope) this.chartScopes.set(chart.id, this.scopeKey(scope));
    }
    for (const account of accounts)
      this.accounts.set(account.id, structuredClone(account));
  }
  /** Sets fixture references that emulate posting, relationship, and policy use.
   * @param accountId - Account to annotate.
   * @param value - Immutable reference counts.
   * @returns Nothing.
   * @throws {AccountingFailure} When the account is absent. */
  public setReferences(
    accountId: string,
    value: Partial<AccountReferences>,
  ): void {
    if (
      Object.values(value).some(
        (count) => !Number.isSafeInteger(count) || count < 0,
      )
    )
      throw new AccountingFailure(
        "INVALID",
        "Reference counts must be nonnegative integers.",
      );
    if (!this.accounts.has(accountId))
      throw new AccountingFailure("NOT_FOUND", "Account does not exist.");
    this.references.set(accountId, {
      postings: 0,
      children: 0,
      integrationRules: 0,
      specialRoles: 0,
      associations: 0,
      ...value,
    });
  }
  /** {@inheritDoc AccountingCommandRepository.execute} */
  public async execute(
    scope: AccountingScope,
    command: AccountingWriteCommand,
  ): Promise<AccountingCommandResult> {
    command = structuredClone(command);
    validateAccountingCommand(command);
    if (
      this.scopeKey(scope) !== this.scopeKey(command) ||
      scope.actorId !== command.actorId
    )
      throw new AccountingFailure(
        "FORBIDDEN",
        "Command and trusted scope differ.",
      );
    const receiptKey = JSON.stringify([
      scope.tenantId,
      scope.organizationId,
      scope.companyId,
      command.idempotencyKey,
    ]);
    const intent = canonical(
      Object.fromEntries(
        Object.entries(command).filter(
          ([key]) => key !== "correlationId" && key !== "idempotencyKey",
        ),
      ),
    );
    const prior = this.receipts.get(receiptKey);
    if (prior) {
      if (prior.intent !== intent)
        throw new AccountingFailure(
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used for another accounting command.",
        );
      return structuredClone({ ...prior.result, replayed: true });
    }
    const charts = new Map(this.charts);
    const scopes = new Map(this.chartScopes);
    const accounts = new Map(this.accounts);
    const auditLength = this.events.length;
    try {
      const result = this.apply(scope, command);
      for (const chart of this.charts.values())
        if (
          this.chartScopes.get(chart.id) === this.scopeKey(scope) &&
          chart.status === "active"
        )
          this.validateMemorandumPairs(chart.id);
      this.events.push({
        kind: command.kind,
        accountId: result.affectedIds[0] ?? "",
        actorId: scope.actorId,
        correlationId: command.correlationId,
      });
      this.receipts.set(receiptKey, {
        intent,
        result: structuredClone(result),
      });
      return structuredClone(result);
    } catch (cause) {
      this.charts.clear();
      for (const [id, value] of charts) this.charts.set(id, value);
      this.chartScopes.clear();
      for (const [id, value] of scopes) this.chartScopes.set(id, value);
      this.accounts.clear();
      for (const [id, value] of accounts) this.accounts.set(id, value);
      this.events.length = auditLength;
      throw cause;
    }
  }
  /** {@inheritDoc AccountingQueryRepository.listCharts} */
  public async listCharts(
    query: ListChartsQuery,
  ): Promise<readonly ChartOfAccounts[]> {
    return structuredClone(
      [...this.charts.values()].filter(
        (chart) =>
          chart.companyId === query.companyId &&
          this.chartScopes.get(chart.id) === this.scopeKey(query) &&
          (query.status === undefined || chart.status === query.status),
      ),
    );
  }
  /** {@inheritDoc AccountingQueryRepository.getAccount} */
  public async getAccount(query: GetAccountQuery): Promise<{
    readonly account: LedgerAccount;
    readonly references: AccountReferences;
  } | null> {
    const account = this.accounts.get(query.accountId);
    if (!account || !this.belongs(query, account)) return null;
    return structuredClone({ account, references: this.refs(account.id) });
  }
  /** {@inheritDoc AccountingQueryRepository.findAccounts} */
  public async findAccounts(
    query: FindAccountsQuery,
  ): Promise<readonly LedgerAccount[]> {
    const search = query.search?.trim().toUpperCase() ?? "";
    return structuredClone(
      [...this.accounts.values()].filter(
        (account) =>
          account.chartId === query.chartId &&
          this.belongs(query, account) &&
          (query.includeInactive || account.isActive) &&
          (!search ||
            account.code.includes(search) ||
            account.name.toUpperCase().includes(search)),
      ),
    );
  }
  private apply(
    scope: AccountingScope,
    command: AccountingWriteCommand,
  ): AccountingCommandResult {
    switch (command.kind) {
      case "unpair_memorandum_accounts":
        return this.unpairMemorandum(scope, command);
      case "pair_memorandum_accounts":
        return this.pairMemorandum(scope, command);
      case "create_chart":
        return this.createChart(scope, command);
      case "change_chart_structure":
        return this.changeStructure(
          scope,
          command.chartId,
          command.expectedVersion,
          command.structure,
        );
      case "activate_chart":
        return this.changeChartStatus(
          scope,
          command.chartId,
          command.expectedVersion,
          "active",
        );
      case "archive_chart":
        return this.changeChartStatus(
          scope,
          command.chartId,
          command.expectedVersion,
          "archived",
        );
      case "create_account":
        return this.createAccount(scope, command);
      case "update_account":
        return this.updateAccount(scope, command);
      case "recode_account":
        return this.recode(
          scope,
          command.accountId,
          command.expectedVersion,
          command.code,
        );
      case "set_account_active":
        return this.setActive(
          scope,
          command.accountId,
          command.expectedVersion,
          command.isActive,
        );
      case "delete_account":
        return this.delete(scope, command.accountId, command.expectedVersion);
      case "convert_account_kind":
        return this.convert(
          scope,
          command.accountId,
          command.expectedVersion,
          command.accountKind,
        );
      case "set_account_classification":
        return this.classify(scope, command);
    }
  }
  private pairMemorandum(
    scope: AccountingScope,
    command: Extract<
      AccountingWriteCommand,
      { readonly kind: "pair_memorandum_accounts" }
    >,
  ): AccountingCommandResult {
    const debit = this.account(
      scope,
      command.debitAccountId,
      command.debitExpectedVersion,
    );
    const credit = this.account(
      scope,
      command.creditAccountId,
      command.creditExpectedVersion,
    );
    if (
      debit.id === credit.id ||
      debit.chartId !== credit.chartId ||
      !debit.isMemorandum ||
      !credit.isMemorandum ||
      debit.kind !== "detail" ||
      credit.kind !== "detail" ||
      debit.normalBalance !== "debit" ||
      credit.normalBalance !== "credit" ||
      !debit.isActive ||
      !credit.isActive
    )
      throw new AccountingFailure(
        "INVALID",
        "Pair requires distinct active memorandum details of opposite nature in one chart.",
      );
    if (
      (debit.memorandumCounterpartId &&
        debit.memorandumCounterpartId !== credit.id) ||
      (credit.memorandumCounterpartId &&
        credit.memorandumCounterpartId !== debit.id)
    )
      throw new AccountingFailure(
        "IN_USE",
        "Unlink an existing memorandum pair before replacing it.",
      );
    this.accounts.set(debit.id, {
      ...debit,
      memorandumCounterpartId: credit.id,
      version: debit.version + 1,
    });
    this.accounts.set(credit.id, {
      ...credit,
      memorandumCounterpartId: debit.id,
      version: credit.version + 1,
    });
    return this.accountReceipt(command, [debit.id, credit.id]);
  }
  private unpairMemorandum(
    scope: AccountingScope,
    command: Extract<
      AccountingWriteCommand,
      { readonly kind: "unpair_memorandum_accounts" }
    >,
  ): AccountingCommandResult {
    const account = this.account(
      scope,
      command.accountId,
      command.expectedVersion,
    );
    if (this.chart(scope, account.chartId).status === "active")
      throw new AccountingFailure(
        "IN_USE",
        "An active chart must retain its memorandum pairs.",
      );
    if (!account.memorandumCounterpartId)
      throw new AccountingFailure(
        "INVALID",
        "The account has no memorandum counterpart.",
      );
    const counterpart = this.account(
      scope,
      account.memorandumCounterpartId,
      command.counterpartExpectedVersion,
    );
    if (counterpart.memorandumCounterpartId !== account.id)
      throw new AccountingFailure(
        "INVALID",
        "The memorandum links are not reciprocal.",
      );
    for (const current of [account, counterpart]) {
      const { memorandumCounterpartId: removed, ...remaining } = current;
      // Removing the property, rather than setting undefined, preserves exact optional semantics.
      if (removed)
        this.accounts.set(current.id, {
          ...remaining,
          version: current.version + 1,
        });
    }
    return this.accountReceipt(command, [account.id, counterpart.id]);
  }
  private createChart(
    scope: AccountingScope,
    command: Extract<AccountingWriteCommand, { readonly kind: "create_chart" }>,
  ): AccountingCommandResult {
    if (this.charts.has(command.chartId))
      throw new AccountingFailure("DUPLICATE_CODE", "Chart id already exists.");
    const chart = chartOfAccounts({
      id: command.chartId,
      companyId: scope.companyId,
      name: command.name,
      status: "draft",
      structure: command.structure,
      version: 1,
    });
    this.charts.set(chart.id, chart);
    this.chartScopes.set(chart.id, this.scopeKey(scope));
    const affected = [chart.id];
    try {
      const initialAccounts =
        command.source?.kind === "copy"
          ? this.copyInputs(
              scope,
              command.source.sourceChartId,
              command.source.accountIds,
            )
          : (command.initialAccounts ?? []);
      const ordered = [...initialAccounts].sort(
        (left, right) =>
          accountCodePosition(chart.structure, left.code).level -
          accountCodePosition(chart.structure, right.code).level,
      );
      for (const initial of ordered) {
        const result = this.createAccount(scope, {
          ...command,
          kind: "create_account",
          accountId: initial.id,
          chartId: chart.id,
          code: initial.code,
          name: initial.name,
          accountKind: initial.accountKind,
          accountType: initial.accountType,
          isMemorandum: initial.isMemorandum ?? false,
          ...(initial.normalBalance === undefined
            ? {}
            : { normalBalance: initial.normalBalance }),
          ...(initial.normalBalanceOverrideReason === undefined
            ? {}
            : {
                normalBalanceOverrideReason:
                  initial.normalBalanceOverrideReason,
              }),
          monetaryClass: initial.monetaryClass ?? null,
        });
        affected.push(...result.affectedIds);
      }
      if (command.source?.kind === "copy") {
        const mapping = command.source.accountIds;
        for (const source of this.forChart(command.source.sourceChartId)) {
          const targetId = mapping[source.id];
          const target = targetId ? this.accounts.get(targetId) : undefined;
          if (!target)
            throw new AccountingFailure(
              "INVALID",
              "A copied account is missing its target identity.",
            );
          const counterpartId = source.memorandumCounterpartId
            ? mapping[source.memorandumCounterpartId]
            : undefined;
          this.accounts.set(target.id, {
            ...target,
            isActive: source.isActive,
            ...(counterpartId === undefined
              ? {}
              : { memorandumCounterpartId: counterpartId }),
          });
        }
      }
    } catch (cause) {
      this.charts.delete(chart.id);
      this.chartScopes.delete(chart.id);
      for (const id of affected.slice(1)) this.accounts.delete(id);
      throw cause;
    }
    return receipt(
      command,
      affected,
      Object.fromEntries(affected.map((id) => [id, 1])),
    );
  }
  private changeStructure(
    scope: AccountingScope,
    chartId: string,
    expected: number,
    structure: ChartOfAccounts["structure"],
  ): AccountingCommandResult {
    const chart = this.chart(scope, chartId, expected);
    for (const account of this.forChart(chart.id))
      accountCodePosition(structure, account.code);
    const next = {
      ...chart,
      structure: codeStructure(structure),
      version: chart.version + 1,
    };
    this.charts.set(chart.id, next);
    return receipt({ kind: "change_chart_structure" }, [chart.id], {
      [chart.id]: next.version,
    });
  }
  private changeChartStatus(
    scope: AccountingScope,
    chartId: string,
    expected: number,
    status: ChartOfAccounts["status"],
  ): AccountingCommandResult {
    const chart = this.chart(scope, chartId, expected);
    const affected = [chart.id];
    if (status === "archived" && chart.status === "active")
      throw new AccountingFailure(
        "ACTIVE_CHART_CONFLICT",
        "The active chart must be replaced by activating another chart.",
      );
    if (status === "active") {
      this.validateHierarchy(chart);
      this.validateMemorandumPairs(chart.id);
    }
    if (status === "active")
      for (const current of this.charts.values())
        if (
          this.chartScopes.get(current.id) === this.scopeKey(scope) &&
          current.companyId === scope.companyId &&
          current.status === "active" &&
          current.id !== chart.id
        ) {
          if (
            this.forChart(current.id).some(
              (account) => this.refs(account.id).postings > 0,
            )
          )
            throw new AccountingFailure(
              "HAS_POSTINGS",
              "A chart with postings cannot be archived during activation.",
            );
          this.charts.set(current.id, {
            ...current,
            status: "archived",
            version: current.version + 1,
          });
          affected.push(current.id);
        }
    const next = { ...chart, status, version: chart.version + 1 };
    this.charts.set(chart.id, next);
    return receipt(
      { kind: status },
      affected,
      Object.fromEntries(
        affected.map((id) => [id, this.charts.get(id)?.version ?? 0]),
      ),
    );
  }
  private createAccount(
    scope: AccountingScope,
    command: Extract<
      AccountingWriteCommand,
      { readonly kind: "create_account" }
    >,
  ): AccountingCommandResult {
    if (this.accounts.has(command.accountId))
      throw new AccountingFailure(
        "DUPLICATE_CODE",
        "Account id already exists.",
      );
    const chart = this.chart(scope, command.chartId);
    if (
      this.forChart(chart.id).some(
        (account) => account.code === command.code.trim().toUpperCase(),
      )
    )
      throw new AccountingFailure(
        "DUPLICATE_CODE",
        "Account code already exists in the chart.",
      );
    const account = ledgerAccount(chart.structure, {
      id: command.accountId,
      chartId: chart.id,
      code: command.code,
      name: command.name,
      kind: command.accountKind,
      type: command.accountType,
      isMemorandum: command.isMemorandum,
      ...(command.normalBalance === undefined
        ? {}
        : { normalBalance: command.normalBalance }),
      monetaryClass: command.monetaryClass,
      ...(command.normalBalanceOverrideReason === undefined
        ? {}
        : { normalBalanceOverrideReason: command.normalBalanceOverrideReason }),
      isActive: true,
      version: 1,
    });
    if (account.parentCode) {
      const parent = this.forChart(chart.id).find(
        (item) => item.code === account.parentCode,
      );
      if (!parent || !parent.isActive)
        throw new AccountingFailure(
          "PARENT_INVALID",
          "The immediate parent must exist and be active.",
        );
      inheritAccountClassification(parent, account);
    }
    this.accounts.set(account.id, account);
    if (command.normalBalanceOverrideReason)
      this.events.push({
        kind: "normal_balance_override",
        accountId: account.id,
        reason: command.normalBalanceOverrideReason,
      });
    return receipt(command, [account.id], { [account.id]: 1 });
  }
  private updateAccount(
    scope: AccountingScope,
    command: Extract<
      AccountingWriteCommand,
      { readonly kind: "update_account" }
    >,
  ): AccountingCommandResult {
    const account = this.account(
      scope,
      command.accountId,
      command.expectedVersion,
    );
    const nextKind = accountKindConversion(
      account,
      command.accountKind ?? account.kind,
      this.refs(account.id).postings,
      this.children(account).length,
    );
    const changing =
      (command.accountType !== undefined &&
        command.accountType !== account.type) ||
      (command.isMemorandum !== undefined &&
        command.isMemorandum !== account.isMemorandum) ||
      (command.monetaryClass !== undefined &&
        command.monetaryClass !== account.monetaryClass);
    const affected = changing ? this.subtree(account) : [account];
    if (
      affected.some((item) => item.memorandumCounterpartId) &&
      (command.isMemorandum === false || command.accountKind === "summary")
    )
      throw new AccountingFailure(
        "IN_USE",
        "Unpair memorandum accounts before changing their classification or kind.",
      );
    if (
      command.accountType !== undefined &&
      command.accountType !== account.type &&
      affected.some((item) => this.refs(item.id).postings > 0)
    )
      throw new AccountingFailure(
        "HAS_POSTINGS",
        "Classification changes require an unposted subtree.",
      );
    for (const item of affected) {
      const type = command.accountType ?? item.type;
      const typeChanged = type !== item.type;
      const reason =
        command.normalBalanceOverrideReason ??
        (typeChanged ? undefined : item.normalBalanceOverrideReason);
      const next = ledgerAccount(this.chart(scope, account.chartId).structure, {
        ...item,
        name: item.id === account.id ? command.name : item.name,
        kind: item.id === account.id ? nextKind : item.kind,
        type,
        isMemorandum: command.isMemorandum ?? item.isMemorandum,
        normalBalance:
          command.normalBalance ??
          (typeChanged ? normalBalanceFor(type) : item.normalBalance),
        ...(reason === undefined
          ? {}
          : { normalBalanceOverrideReason: reason }),
        monetaryClass:
          command.monetaryClass === undefined
            ? item.monetaryClass
            : command.monetaryClass,
        version: item.version + 1,
      });
      this.accounts.set(item.id, next);
    }
    this.validateHierarchy(
      this.chart(scope, account.chartId),
      affected.map((item) => item.id),
    );
    if (command.normalBalanceOverrideReason)
      this.events.push({
        kind: "normal_balance_override",
        accountId: account.id,
        reason: command.normalBalanceOverrideReason,
      });
    return this.accountReceipt(
      command,
      affected.map((item) => item.id),
    );
  }

  private recode(
    scope: AccountingScope,
    accountId: string,
    expected: number,
    code: string,
  ): AccountingCommandResult {
    const account = this.account(scope, accountId, expected);
    const chart = this.chart(scope, account.chartId);
    const normalized = code.trim().toUpperCase();
    const affected = this.subtree(account);
    const ids = new Set(affected.map((item) => item.id));
    const occupied = new Set(
      this.forChart(chart.id)
        .filter((item) => !ids.has(item.id))
        .map((item) => item.code),
    );
    for (const item of affected) {
      const nextCode = normalized + item.code.slice(account.code.length);
      const position = accountCodePosition(chart.structure, nextCode);
      if (occupied.has(nextCode))
        throw new AccountingFailure(
          "DUPLICATE_CODE",
          "Recoding collides with an existing account.",
        );
      occupied.add(nextCode);
      this.accounts.set(item.id, {
        ...item,
        code: nextCode,
        parentCode: position.parentCode,
        level: position.level,
        version: item.version + 1,
      });
    }
    this.validateHierarchy(
      chart,
      affected.map((item) => item.id),
    );
    this.events.push({
      kind: "recode_account",
      accountId,
      previousCode: account.code,
      nextCode: normalized,
    });
    return this.accountReceipt(
      { kind: "recode_account" },
      affected.map((item) => item.id),
    );
  }

  private setActive(
    scope: AccountingScope,
    accountId: string,
    expected: number,
    isActive: boolean,
  ): AccountingCommandResult {
    const account = this.account(scope, accountId, expected);
    const refs = this.refs(account.id);
    if (
      !isActive &&
      account.kind === "summary" &&
      this.forChart(account.chartId).some(
        (child) => child.parentCode === account.code && child.isActive,
      )
    )
      throw new AccountingFailure(
        "HAS_CHILDREN",
        "A summary account requires inactive children before inactivation.",
      );
    if (!isActive && (refs.specialRoles > 0 || account.memorandumCounterpartId))
      throw new AccountingFailure(
        "IN_USE",
        "An account assigned to a special role cannot be inactivated.",
      );
    if (isActive && account.parentCode) {
      const parent = this.forChart(account.chartId).find(
        (item) => item.code === account.parentCode,
      );
      if (!parent?.isActive)
        throw new AccountingFailure(
          "PARENT_INVALID",
          "An account requires an active parent.",
        );
    }
    const next = { ...account, isActive, version: account.version + 1 };
    this.accounts.set(account.id, next);
    return receipt({ kind: "set_account_active" }, [account.id], {
      [account.id]: next.version,
    });
  }
  private delete(
    scope: AccountingScope,
    accountId: string,
    expected: number,
  ): AccountingCommandResult {
    const account = this.account(scope, accountId, expected);
    const refs = this.refs(account.id);
    if (refs.postings > 0)
      throw new AccountingFailure(
        "HAS_POSTINGS",
        "A posted account cannot be deleted.",
      );
    if (
      this.forChart(account.chartId).some(
        (child) => child.parentCode === account.code,
      )
    )
      throw new AccountingFailure(
        "HAS_CHILDREN",
        "An account with children cannot be deleted.",
      );
    if (
      account.memorandumCounterpartId ||
      refs.integrationRules + refs.specialRoles + refs.associations > 0
    )
      throw new AccountingFailure(
        "IN_USE",
        "An account with references cannot be deleted.",
      );
    this.accounts.delete(account.id);
    return receipt({ kind: "delete_account" }, [account.id], {});
  }
  private convert(
    scope: AccountingScope,
    accountId: string,
    expected: number,
    kind: LedgerAccount["kind"],
  ): AccountingCommandResult {
    const account = this.account(scope, accountId, expected);
    if (account.memorandumCounterpartId && kind === "summary")
      throw new AccountingFailure(
        "IN_USE",
        "Unpair the memorandum account before converting it.",
      );
    const nextKind = accountKindConversion(
      account,
      kind,
      this.refs(account.id).postings,
      this.forChart(account.chartId).filter(
        (child) => child.parentCode === account.code,
      ).length,
    );
    const next = { ...account, kind: nextKind, version: account.version + 1 };
    this.accounts.set(account.id, next);
    return receipt({ kind: "convert_account_kind" }, [account.id], {
      [account.id]: next.version,
    });
  }
  private classify(
    scope: AccountingScope,
    command: Extract<
      AccountingWriteCommand,
      { readonly kind: "set_account_classification" }
    >,
  ): AccountingCommandResult {
    const account = this.account(
      scope,
      command.accountId,
      command.expectedVersion,
    );
    return this.updateAccount(scope, {
      ...command,
      kind: "update_account",
      name: account.name,
    });
  }

  private chart(
    scope: AccountingScope,
    id: string,
    expected?: number,
  ): ChartOfAccounts {
    const chart = this.charts.get(id);
    if (
      !chart ||
      chart.companyId !== scope.companyId ||
      this.chartScopes.get(id) !== this.scopeKey(scope)
    )
      throw new AccountingFailure("NOT_FOUND", "Chart does not exist.");
    if (expected !== undefined && expected !== chart.version)
      throw new AccountingFailure(
        "VERSION_CONFLICT",
        "Chart changed; reload it before retrying.",
      );
    return chart;
  }
  private account(
    scope: AccountingScope,
    id: string,
    expected: number,
  ): LedgerAccount {
    const account = this.accounts.get(id);
    if (!account || !this.belongs(scope, account))
      throw new AccountingFailure("NOT_FOUND", "Account does not exist.");
    if (expected !== account.version)
      throw new AccountingFailure(
        "VERSION_CONFLICT",
        "Account changed; reload it before retrying.",
      );
    return account;
  }
  private belongs(scope: AccountingScope, account: LedgerAccount): boolean {
    return (
      this.charts.get(account.chartId)?.companyId === scope.companyId &&
      this.chartScopes.get(account.chartId) === this.scopeKey(scope)
    );
  }
  private forChart(chartId: string): LedgerAccount[] {
    return structuredClone(
      [...this.accounts.values()].filter(
        (account) => account.chartId === chartId,
      ),
    );
  }
  private refs(accountId: string): AccountReferences {
    const account = this.accounts.get(accountId);
    const value = this.references.get(accountId) ?? {
      postings: 0,
      children: 0,
      integrationRules: 0,
      specialRoles: 0,
      associations: 0,
    };
    return { ...value, children: account ? this.children(account).length : 0 };
  }

  private children(account: LedgerAccount): LedgerAccount[] {
    return this.forChart(account.chartId).filter(
      (item) => item.parentCode === account.code,
    );
  }
  private subtree(account: LedgerAccount): LedgerAccount[] {
    const result = [account];
    const ids = new Set([account.id]);
    for (let i = 0; i < result.length; i++) {
      const item = result[i];
      if (!item) continue;
      for (const child of this.children(item)) {
        if (ids.has(child.id))
          throw new AccountingFailure(
            "PARENT_INVALID",
            "Hierarchy contains a cycle.",
          );
        ids.add(child.id);
        result.push(child);
      }
    }
    return result;
  }
  private validateHierarchy(
    chart: ChartOfAccounts,
    ids?: readonly string[],
  ): void {
    const accounts = this.forChart(chart.id);
    for (const account of accounts.filter(
      (item) => ids === undefined || ids.includes(item.id),
    )) {
      const position = accountCodePosition(chart.structure, account.code);
      if (position.parentCode !== account.parentCode)
        throw new AccountingFailure(
          "PARENT_INVALID",
          "Parent is not the immediate code prefix.",
        );
      if (account.parentCode) {
        const parent = accounts.find(
          (item) => item.code === account.parentCode,
        );
        if (!parent || (account.isActive && !parent.isActive))
          throw new AccountingFailure(
            "PARENT_INVALID",
            "Active accounts require an active parent.",
          );
        inheritAccountClassification(parent, account);
      }
    }
  }
  private validateMemorandumPairs(chartId: string): void {
    const accounts = this.forChart(chartId);
    for (const account of accounts.filter(
      (item) => item.isMemorandum && item.kind === "detail" && item.isActive,
    )) {
      const counterpart = accounts.find(
        (item) => item.id === account.memorandumCounterpartId,
      );
      if (
        !counterpart ||
        counterpart.id === account.id ||
        !counterpart.isMemorandum ||
        counterpart.kind !== "detail" ||
        !counterpart.isActive ||
        counterpart.normalBalance === account.normalBalance ||
        counterpart.memorandumCounterpartId !== account.id
      )
        throw new AccountingFailure(
          "INVALID",
          "Active memorandum detail accounts require a reciprocal debit-credit counterpart.",
        );
    }
  }
  private accountReceipt(
    command: { readonly kind: string },
    ids: readonly string[],
  ): AccountingCommandResult {
    return receipt(
      command,
      ids,
      Object.fromEntries(
        ids.map((id) => [id, this.accounts.get(id)?.version ?? 0]),
      ),
    );
  }

  private copyInputs(
    scope: AccountingScope,
    sourceChartId: string,
    ids: Readonly<Record<string, string>>,
  ): readonly InitialAccountInput[] {
    const source = this.chart(scope, sourceChartId);
    const accounts = this.forChart(source.id).sort(
      (left, right) =>
        left.level - right.level || left.code.localeCompare(right.code),
    );
    if (
      Object.keys(ids).length !== accounts.length ||
      accounts.some((account) => !ids[account.id])
    )
      throw new AccountingFailure(
        "INVALID",
        "A copied chart needs one new identifier for every source account.",
      );
    return accounts.map((account) => ({
      id: ids[account.id]!,
      code: account.code,
      name: account.name,
      accountKind: account.kind,
      accountType: account.type,
      isMemorandum: account.isMemorandum,
      normalBalance: account.normalBalance,
      ...(account.normalBalanceOverrideReason === undefined
        ? {}
        : { normalBalanceOverrideReason: account.normalBalanceOverrideReason }),
      monetaryClass: account.monetaryClass,
    }));
  }
  private scopeKey(
    scope: Pick<AccountingScope, "tenantId" | "organizationId" | "companyId">,
  ): string {
    return JSON.stringify([
      scope.tenantId,
      scope.organizationId,
      scope.companyId,
    ]);
  }
}

function receipt(
  command: { readonly kind: string },
  affectedIds: readonly string[],
  versions: Readonly<Record<string, number>>,
): AccountingCommandResult {
  return {
    commandId: `${command.kind}:${affectedIds[0] ?? "none"}`,
    replayed: false,
    affectedIds,
    versions,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
