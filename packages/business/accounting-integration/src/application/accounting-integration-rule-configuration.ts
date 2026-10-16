import {
  AccountingIntegrationFailure,
  type AccountingIntegrationConfigurationAmountField,
  type AccountingIntegrationConfigurationRule,
  type AccountingIntegrationRuleConfiguration,
  type AccountingIntegrationSource,
} from "../domain";

/** Trusted server-side scope used to read or replace an editable accounting mapping configuration. */
export interface AccountingIntegrationRuleConfigurationScope<TSource extends AccountingIntegrationSource = AccountingIntegrationSource> {
  readonly actorId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly source: TSource;
}

/** Explicit compare-and-swap request for a complete mapping configuration replacement. */
export interface ReplaceAccountingIntegrationRuleConfigurationInput<TSource extends AccountingIntegrationSource = AccountingIntegrationSource>
  extends AccountingIntegrationRuleConfigurationScope<TSource> {
  readonly expectedVersion: string;
  readonly rules: readonly AccountingIntegrationConfigurationRule[];
}

/** Persistence boundary for authorized versioned accounting mapping configuration. */
export interface AccountingIntegrationRuleConfigurationRepository {
  /**
   * Reads the full configuration, including inactive rules and an empty rule list.
   * @param scope - Authenticated actor and full operational scope.
   * @returns The current immutable configuration.
   * @throws {AccountingIntegrationFailure} When access or returned evidence is invalid.
   */
  read<TSource extends AccountingIntegrationSource>(
    scope: AccountingIntegrationRuleConfigurationScope<TSource>,
  ): Promise<AccountingIntegrationRuleConfiguration<TSource>>;

  /**
   * Atomically replaces mappings when the expected version still matches.
   * @param input - Authenticated scope, expected version, and complete replacement rules.
   * @returns The persisted configuration with its new version.
   * @throws {AccountingIntegrationFailure} When authorization, validation, or concurrency checks fail.
   */
  replace<TSource extends AccountingIntegrationSource>(
    input: ReplaceAccountingIntegrationRuleConfigurationInput<TSource>,
  ): Promise<AccountingIntegrationRuleConfiguration<TSource>>;
}

/** Reads an editable configuration without requiring any active mappings. */
export class ReadAccountingIntegrationRuleConfiguration {
  /**
   * @param repository - Authorized configuration persistence boundary.
   * @returns A configuration reader use case.
   */
  public constructor(private readonly repository: AccountingIntegrationRuleConfigurationRepository) {}

  /**
   * @param scope - Trusted server-side actor and scope.
   * @returns A normalized, immutable configuration which may be empty or entirely inactive.
   * @throws {AccountingIntegrationFailure} When scope, access, or returned configuration is invalid.
   */
  public async execute<TSource extends AccountingIntegrationSource>(
    scope: AccountingIntegrationRuleConfigurationScope<TSource>,
  ): Promise<AccountingIntegrationRuleConfiguration<TSource>> {
    validateScope(scope);
    try {
      return validateAccountingIntegrationRuleConfiguration(await this.repository.read(scope), scope.source);
    } catch (error) {
      if (error instanceof AccountingIntegrationFailure) throw error;
      throw unavailable("Accounting rule configuration source is unavailable.", error);
    }
  }
}

/** Replaces an entire source mapping configuration using an expected revision. */
export class ReplaceAccountingIntegrationRuleConfiguration {
  /**
   * @param repository - Authorized configuration persistence boundary.
   * @returns A compare-and-swap configuration writer use case.
   */
  public constructor(private readonly repository: AccountingIntegrationRuleConfigurationRepository) {}

  /**
   * @param input - Trusted scope, expected revision, and complete desired mapping list.
   * @returns The normalized, immutable configuration persisted by the repository.
   * @throws {AccountingIntegrationFailure} When scope, mapping, access, or expected revision is invalid or stale.
   */
  public async execute<TSource extends AccountingIntegrationSource>(
    input: ReplaceAccountingIntegrationRuleConfigurationInput<TSource>,
  ): Promise<AccountingIntegrationRuleConfiguration<TSource>> {
    validateScope(input);
    requiredText(input.expectedVersion, "expected configuration version", 64, "ACCOUNTING_INTEGRATION_RULESET_CHANGED");
    const rules = validateRules(input.rules, input.source);
    try {
      const persisted = await this.repository.replace({ ...input, rules });
      return validateAccountingIntegrationRuleConfiguration(persisted, input.source);
    } catch (error) {
      if (error instanceof AccountingIntegrationFailure) throw error;
      throw unavailable("Accounting rule configuration source is unavailable.", error);
    }
  }
}

/**
 * Normalizes untrusted configuration evidence while allowing an empty or partial mapping list.
 * @param configuration - Configuration evidence returned from an authorized repository.
 * @param expectedSource - Source selected by the caller's trusted scope.
 * @returns A frozen, validated configuration.
 * @throws {AccountingIntegrationFailure} When source, version, or rules are invalid.
 */
export function validateAccountingIntegrationRuleConfiguration<TSource extends AccountingIntegrationSource>(
  configuration: AccountingIntegrationRuleConfiguration<TSource>,
  expectedSource: TSource,
): AccountingIntegrationRuleConfiguration<TSource> {
  if (!configuration || typeof configuration !== "object" || configuration.source !== expectedSource || !Array.isArray(configuration.rules)) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Accounting rule configuration is malformed.");
  }
  const version = requiredText(configuration.version, "configuration version", 64, "ACCOUNTING_INTEGRATION_RULESET_INVALID");
  return Object.freeze({ source: expectedSource, version, rules: validateRules(configuration.rules, expectedSource) });
}

function validateScope<TSource extends AccountingIntegrationSource>(scope: AccountingIntegrationRuleConfigurationScope<TSource>): void {
  if (!scope || typeof scope !== "object") {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Trusted accounting rule configuration scope is invalid.");
  }
  for (const [label, value] of Object.entries({ actor: scope.actorId, tenant: scope.tenantId, organization: scope.organizationId, company: scope.companyId })) {
    requiredText(value, `${label} scope`, 128, "ACCOUNTING_INTEGRATION_ACCESS_DENIED");
  }
  if (scope.source !== "payroll.run_confirmed" && scope.source !== "purchasing.invoice_confirmed") {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Accounting rule configuration source is unsupported.");
  }
}

function validateRules<TSource extends AccountingIntegrationSource>(
  input: readonly AccountingIntegrationConfigurationRule[],
  source: TSource,
): readonly AccountingIntegrationConfigurationRule[] {
  if (!Array.isArray(input) || input.length > 32) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Accounting rule configuration must contain at most 32 mappings.");
  }
  const identifiers = new Set<string>();
  return Object.freeze(input.map((rule) => {
    if (!rule || typeof rule !== "object" || !isAmountFieldForSource(rule.amountField, source) || typeof rule.isActive !== "boolean") {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Accounting mapping has an unsupported source amount or activation state.");
    }
    const id = requiredText(rule.id, "rule identifier", 128);
    const debitAccountId = requiredText(rule.debitAccountId, "debit account identifier", 128);
    const creditAccountId = requiredText(rule.creditAccountId, "credit account identifier", 128);
    if (identifiers.has(id) || debitAccountId === creditAccountId) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Accounting mappings require unique rule identifiers and distinct debit and credit accounts.");
    }
    identifiers.add(id);
    return Object.freeze({
      id,
      amountField: rule.amountField,
      debitAccountId,
      creditAccountId,
      description: requiredText(rule.description, "rule description", 500),
      isActive: rule.isActive,
    });
  }));
}

function isAmountFieldForSource(
  value: unknown,
  source: AccountingIntegrationSource,
): value is AccountingIntegrationConfigurationAmountField {
  if (source === "payroll.run_confirmed") {
    return value === "gross_earnings" || value === "employee_deductions" || value === "net_pay";
  }
  return value === "recognized_inventory_cost";
}

function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
  code: "ACCOUNTING_INTEGRATION_RULE_INVALID" | "ACCOUNTING_INTEGRATION_RULESET_INVALID" | "ACCOUNTING_INTEGRATION_ACCESS_DENIED" | "ACCOUNTING_INTEGRATION_RULESET_CHANGED" = "ACCOUNTING_INTEGRATION_RULE_INVALID",
): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new AccountingIntegrationFailure(code, `${label} is invalid.`);
  }
  return value.trim();
}

function unavailable(message: string, cause: unknown): AccountingIntegrationFailure {
  return new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE", message, { cause });
}
