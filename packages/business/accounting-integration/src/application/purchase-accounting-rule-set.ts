import {
  AccountingIntegrationFailure,
  type PurchaseAccountingAmountField,
  type PurchaseAccountingRuleSet,
} from "../domain";

/** Trusted server-side scope used to load active purchase accounting mappings. */
export interface PurchaseAccountingRuleSetQuery {
  readonly actorId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
}

/** Persistence boundary for active, versioned purchase accounting mappings. */
export interface PurchaseAccountingRuleSetReader {
  /**
   * Reads active mappings authorized for the supplied scope.
   * @param query - Authenticated actor and complete tenant, organization, and company scope.
   * @returns The typed active purchase rule set.
   * @throws {AccountingIntegrationFailure} When access or configured mappings are invalid.
   */
  readActive(query: PurchaseAccountingRuleSetQuery): Promise<PurchaseAccountingRuleSet>;
}

/** Application use case that validates purchase accounting mappings before planning. */
export class ReadActivePurchaseAccountingRuleSet {
  /**
   * @param reader - Authorized source of active purchase accounting mappings.
   * @returns A rule-set query use case bound to its reader.
   */
  public constructor(private readonly reader: PurchaseAccountingRuleSetReader) {}

  /**
   * @param query - Trusted server-side mapping scope.
   * @returns An immutable, validated purchase rule set.
   * @throws {AccountingIntegrationFailure} When scope, access, or mapping evidence is invalid.
   */
  public async execute(query: PurchaseAccountingRuleSetQuery): Promise<PurchaseAccountingRuleSet> {
    validateQuery(query);
    try {
      return validatePurchaseAccountingRuleSet(await this.reader.readActive(query));
    } catch (error) {
      if (error instanceof AccountingIntegrationFailure) throw error;
      throw new AccountingIntegrationFailure(
        "ACCOUNTING_INTEGRATION_REPOSITORY_UNAVAILABLE",
        "Purchase accounting rule source is unavailable.",
        { cause: error },
      );
    }
  }
}

/**
 * Validates rule evidence delivered by an adapter and freezes its externally visible shape.
 * @param ruleSet - Untrusted rule evidence returned by an authorized source.
 * @returns A normalized immutable purchase rule set.
 * @throws {AccountingIntegrationFailure} When the source, rule versions, fields, or accounts are invalid.
 */
export function validatePurchaseAccountingRuleSet(ruleSet: PurchaseAccountingRuleSet): PurchaseAccountingRuleSet {
  if (!ruleSet || typeof ruleSet !== "object" || ruleSet.source !== "purchasing.invoice_confirmed" || !Array.isArray(ruleSet.rules) || ruleSet.rules.length === 0) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Purchase accounting rule set is invalid or has no active mappings.");
  }
  const version = requiredText(ruleSet.version, "rule set version", 64);
  const identifiers = new Set<string>();
  const rules = ruleSet.rules.map((rule) => {
    if (!rule || typeof rule !== "object" || !isAmountField(rule.amountField)) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Purchase accounting mapping has an unsupported amount field.");
    }
    const id = requiredText(rule.id, "rule identifier", 128);
    const debitAccountId = requiredText(rule.debitAccountId, "debit account identifier", 128);
    const creditAccountId = requiredText(rule.creditAccountId, "credit account identifier", 128);
    if (identifiers.has(id) || debitAccountId === creditAccountId) {
      throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Purchase accounting mappings require unique rules and distinct debit and credit accounts.");
    }
    identifiers.add(id);
    return Object.freeze({ id, version: requiredText(rule.version, "rule version", 64), amountField: rule.amountField, debitAccountId, creditAccountId });
  });
  return Object.freeze({ source: "purchasing.invoice_confirmed", version, rules: Object.freeze(rules) });
}

function validateQuery(query: PurchaseAccountingRuleSetQuery): void {
  if (!query || typeof query !== "object") throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ACCESS_DENIED", "Trusted purchase accounting rule scope is invalid.");
  for (const [label, value] of Object.entries({ actor: query.actorId, tenant: query.tenantId, organization: query.organizationId, company: query.companyId })) {
    requiredText(value, `${label} scope`, 128, "ACCOUNTING_INTEGRATION_ACCESS_DENIED");
  }
}

function isAmountField(value: unknown): value is PurchaseAccountingAmountField {
  return value === "recognized_inventory_cost";
}

function requiredText(value: unknown, label: string, maxLength: number, code: "ACCOUNTING_INTEGRATION_RULE_INVALID" | "ACCOUNTING_INTEGRATION_RULESET_INVALID" | "ACCOUNTING_INTEGRATION_ACCESS_DENIED" = "ACCOUNTING_INTEGRATION_RULE_INVALID"): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new AccountingIntegrationFailure(code, `${label} is invalid.`);
  }
  return value.trim();
}
