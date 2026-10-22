import {
  AccountingIntegrationFailure,
  type PayrollAccountingAmountField,
  type PayrollAccountingRuleSet,
} from "../domain";

/** Trusted server-side scope used to load active payroll accounting mappings. */
export interface PayrollAccountingRuleSetQuery {
  readonly actorId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
}

/** Persistence boundary for the active, versioned payroll accounting mappings. */
export interface PayrollAccountingRuleSetReader {
  /**
   * Reads the active rule set that is authorized for the supplied scope.
   * @param query - Authenticated actor and complete tenant, organization, and company scope.
   * @returns The typed active payroll rule set.
   * @throws {AccountingIntegrationFailure} When access or the configured mappings are invalid.
   */
  readActive(query: PayrollAccountingRuleSetQuery): Promise<PayrollAccountingRuleSet>;
}

/** Application use case that validates active payroll accounting mappings before planning. */
export class ReadActivePayrollAccountingRuleSet {
  /**
   * @param reader - Authorized source of active payroll accounting mappings.
   * @returns A rule-set query use case bound to the reader.
   */
  public constructor(private readonly reader: PayrollAccountingRuleSetReader) {}

  /**
   * @param query - Trusted server-side mapping scope.
   * @returns An immutable, validated payroll rule set.
   * @throws {AccountingIntegrationFailure} When scope, access, or mapping evidence is invalid.
   */
  public async execute(query: PayrollAccountingRuleSetQuery): Promise<PayrollAccountingRuleSet> {
    validateQuery(query);
    try {
      return validatePayrollAccountingRuleSet(await this.reader.readActive(query));
    } catch (error) {
      if (error instanceof AccountingIntegrationFailure) throw error;
      throw new AccountingIntegrationFailure(
        "ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE",
        "Payroll accounting rule source is unavailable.",
        { cause: error },
      );
    }
  }
}

/**
 * Validates rule evidence delivered by an adapter and freezes its externally visible shape.
 * @param ruleSet - Untrusted rule evidence returned by an authorized source.
 * @returns A normalized immutable payroll rule set.
 * @throws {AccountingIntegrationFailure} When the source, rule versions, fields, or accounts are invalid.
 */
export function validatePayrollAccountingRuleSet(ruleSet: PayrollAccountingRuleSet): PayrollAccountingRuleSet {
  if (!ruleSet || typeof ruleSet !== "object" || ruleSet.source !== "payroll.run_confirmed" || !Array.isArray(ruleSet.rules) || ruleSet.rules.length === 0) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Payroll accounting rule set is invalid or has no active mappings.");
  }
  const version = requiredText(ruleSet.version, "rule set version", 64);
  const identifiers = new Set<string>();
  const rules = ruleSet.rules.map((rule) => {
    if (!rule || typeof rule !== "object" || !isAmountField(rule.amountField)) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Payroll accounting mapping has an unsupported amount field.");
    }
    const id = requiredText(rule.id, "rule identifier", 128);
    const debitAccountId = requiredText(rule.debitAccountId, "debit account identifier", 128);
    const creditAccountId = requiredText(rule.creditAccountId, "credit account identifier", 128);
    if (identifiers.has(id) || debitAccountId === creditAccountId) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Payroll accounting mappings require unique rules and distinct debit and credit accounts.");
    }
    identifiers.add(id);
    return Object.freeze({ id, version: requiredText(rule.version, "rule version", 64), amountField: rule.amountField, debitAccountId, creditAccountId });
  });
  return Object.freeze({ source: "payroll.run_confirmed", version, rules: Object.freeze(rules) });
}

function validateQuery(query: PayrollAccountingRuleSetQuery): void {
  if (!query || typeof query !== "object") throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Trusted payroll accounting rule scope is invalid.");
  for (const [label, value] of Object.entries({ actor: query.actorId, tenant: query.tenantId, organization: query.organizationId, company: query.companyId })) {
    requiredText(value, `${label} scope`, 128, "ACCOUNTING_INTEGRATION_ACCESS_DENIED");
  }
}

function isAmountField(value: unknown): value is PayrollAccountingAmountField {
  return value === "gross_earnings" || value === "employee_deductions" || value === "employer_contributions" || value === "net_pay";
}

function requiredText(value: unknown, label: string, maxLength: number, code: "ACCOUNTING_INTEGRATION_RULE_INVALID" | "ACCOUNTING_INTEGRATION_RULESET_INVALID" | "ACCOUNTING_INTEGRATION_ACCESS_DENIED" = "ACCOUNTING_INTEGRATION_RULE_INVALID"): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new AccountingIntegrationFailure(code, `${label} is invalid.`);
  }
  return value.trim();
}
