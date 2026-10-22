import type { Money } from "@kontave/monetary/domain";
import { moneyFromMinor, moneyToDecimal, sameCurrency } from "@kontave/monetary/domain";
import { AccountingIntegrationFailure } from "./failure";

/** Source event families that this initial portable cut can turn into a journal plan. */
export type AccountingIntegrationSource = "payroll.run_confirmed" | "purchasing.invoice_confirmed";

/** Typed payroll amounts available to a payroll integration rule. */
export type PayrollAccountingAmountField = "gross_earnings" | "employee_deductions" | "employer_contributions" | "net_pay";

/** Typed purchasing amount available to a purchasing integration rule. */
export type PurchaseAccountingAmountField = "recognized_inventory_cost";

/** One immutable debit/credit mapping for a source amount field. */
export interface AccountingIntegrationRule {
  readonly id: string;
  readonly version: string;
  readonly debitAccountId: string;
  readonly creditAccountId: string;
}

/** Versioned mappings for a confirmed payroll run. */
export interface PayrollAccountingRuleSet {
  readonly source: "payroll.run_confirmed";
  readonly version: string;
  readonly rules: readonly (AccountingIntegrationRule & { readonly amountField: PayrollAccountingAmountField })[];
}

/** Versioned mappings for a confirmed supplier purchase invoice. */
export interface PurchaseAccountingRuleSet {
  readonly source: "purchasing.invoice_confirmed";
  readonly version: string;
  readonly rules: readonly (AccountingIntegrationRule & { readonly amountField: PurchaseAccountingAmountField })[];
}

/** A confirmed payroll snapshot, already scoped and converted to VES by its owning capability. */
export interface PayrollRunConfirmedAccountingEvent {
  readonly source: "payroll.run_confirmed";
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly payrollRunId: string;
  readonly payrollRunVersion: number;
  readonly effectiveDate: string;
  readonly occurredAt: string;
  readonly grossEarnings: Money;
  readonly employeeDeductions: Money;
  /** `null` means the owning payroll source has not calculated this amount yet. */
  readonly employerContributions: Money | null;
  readonly netPay: Money;
}

/** A confirmed purchase invoice snapshot, already scoped and expressed in VES. */
export interface PurchaseInvoiceConfirmedAccountingEvent {
  readonly source: "purchasing.invoice_confirmed";
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly purchaseInvoiceId: string;
  readonly purchaseInvoiceVersion: number;
  readonly effectiveDate: string;
  readonly occurredAt: string;
  readonly recognizedInventoryCost: Money;
}

/** One immutable journal line in a portable journal plan. */
export interface AccountingJournalLinePlan {
  readonly accountId: string;
  readonly side: "debit" | "credit";
  readonly amount: Money;
  readonly ruleId: string;
  readonly ruleVersion: string;
}

/** Balanced journal intent ready for an atomic, idempotent persistence adapter. */
export interface AccountingIntegrationPlan {
  readonly operationKey: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly source: AccountingIntegrationSource;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly ruleSetVersion: string;
  readonly effectiveDate: string;
  readonly occurredAt: string;
  readonly description: string;
  readonly lines: readonly AccountingJournalLinePlan[];
}

/** Immutable reversal intent that always points at a previously posted operation. */
export interface AccountingIntegrationReversalPlan {
  readonly operationKey: string;
  readonly originalOperationKey: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly source: AccountingIntegrationSource;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly effectiveDate: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly lines: readonly AccountingJournalLinePlan[];
}

/**
 * Builds a balanced journal plan for a confirmed payroll run without posting it.
 * @param event - Immutable payroll snapshot with VES component totals.
 * @param rules - Explicit versioned mappings selected for the source event.
 * @returns A deterministic, immutable journal plan.
 * @throws {AccountingIntegrationFailure} When the event, mapping, amount, or balance is invalid.
 */
export function planPayrollRunConfirmedIntegration(
  event: PayrollRunConfirmedAccountingEvent,
  rules: PayrollAccountingRuleSet,
): AccountingIntegrationPlan {
  validateEventIdentity(event.tenantId, event.organizationId, event.companyId, event.payrollRunId, event.payrollRunVersion, event.effectiveDate, event.occurredAt);
  validateRuleSet(rules, event.source);
  if (event.employerContributions === null && rules.rules.some((rule) => rule.amountField === "employer_contributions")) {
    throw new AccountingIntegrationFailure(
      "ACCOUNTING_INTEGRATION_RULE_INVALID",
      "Employer contributions are unknown and cannot be mapped to an accounting journal.",
    );
  }
  const amounts: {
    readonly gross_earnings: Money;
    readonly employee_deductions: Money;
    readonly net_pay: Money;
    employer_contributions?: Money;
  } & Record<string, Money> = {
    gross_earnings: requireVesAmount(event.grossEarnings, "gross earnings"),
    employee_deductions: requireVesAmount(event.employeeDeductions, "employee deductions"),
    net_pay: requireVesAmount(event.netPay, "net pay"),
  };
  if (event.employerContributions !== null) {
    amounts.employer_contributions = requireVesAmount(event.employerContributions, "employer contributions");
  }
  reconcilePayrollAmounts(amounts);
  return buildPlan(event, event.payrollRunId, event.payrollRunVersion, rules, amounts, "Payroll run");
}

/**
 * Builds a balanced journal plan for a confirmed supplier purchase invoice without posting it.
 * @param event - Immutable purchase-invoice snapshot with recognized VES inventory cost.
 * @param rules - Explicit versioned mappings selected for the source event.
 * @returns A deterministic, immutable journal plan.
 * @throws {AccountingIntegrationFailure} When the event, mapping, amount, or balance is invalid.
 */
export function planPurchaseInvoiceConfirmedIntegration(
  event: PurchaseInvoiceConfirmedAccountingEvent,
  rules: PurchaseAccountingRuleSet,
): AccountingIntegrationPlan {
  validateEventIdentity(event.tenantId, event.organizationId, event.companyId, event.purchaseInvoiceId, event.purchaseInvoiceVersion, event.effectiveDate, event.occurredAt);
  validateRuleSet(rules, event.source);
  return buildPlan(event, event.purchaseInvoiceId, event.purchaseInvoiceVersion, rules, {
    recognized_inventory_cost: requireVesAmount(event.recognizedInventoryCost, "recognized inventory cost"),
  }, "Purchase invoice");
}

/**
 * Produces a separate, balanced journal plan with sides inverted from an original operation.
 * @param original - Original journal plan that remains immutable and posted.
 * @param input - Reversal date, occurrence instant, and non-empty business reason.
 * @returns An immutable reversal plan referring to the original operation key.
 * @throws {AccountingIntegrationFailure} When the original plan or reversal evidence is invalid.
 */
export function planAccountingIntegrationReversal(
  original: AccountingIntegrationPlan,
  input: { readonly effectiveDate: string; readonly occurredAt: string; readonly reason: string },
): AccountingIntegrationReversalPlan {
  validatePlan(original);
  const reason = boundedText(input.reason, "reversal reason", 500);
  validateLocalDate(input.effectiveDate);
  validateInstant(input.occurredAt);
  const operationKey = `${original.operationKey}:reversal`;
  if (operationKey.length > 240) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_IDENTIFIER_INVALID", "Reversal operation key is too long.");
  return Object.freeze({
    operationKey,
    originalOperationKey: original.operationKey,
    tenantId: original.tenantId,
    organizationId: original.organizationId,
    companyId: original.companyId,
    source: original.source,
    sourceId: original.sourceId,
    sourceVersion: original.sourceVersion,
    effectiveDate: input.effectiveDate,
    occurredAt: input.occurredAt,
    reason,
    lines: Object.freeze(original.lines.map((line) => Object.freeze({ ...line, side: line.side === "debit" ? "credit" : "debit" }))),
  });
}

/**
 * Verifies that a plan remains balanced in one VES currency before it crosses a persistence boundary.
 * @param plan - Journal plan to verify.
 * @returns The same validated plan.
 * @throws {AccountingIntegrationFailure} When identifiers, amounts, or debit/credit totals are invalid.
 */
export function validateAccountingIntegrationPlan(plan: AccountingIntegrationPlan): AccountingIntegrationPlan {
  validatePlan(plan);
  return plan;
}

/**
 * Verifies that a reversal preserves source scope, references an original operation, and remains balanced.
 * @param plan - Reversal plan to verify before it crosses a persistence boundary.
 * @returns The same validated reversal plan.
 * @throws {AccountingIntegrationFailure} When the original reference, evidence, or journal is invalid.
 */
export function validateAccountingIntegrationReversalPlan(
  plan: AccountingIntegrationReversalPlan,
): AccountingIntegrationReversalPlan {
  validateEventIdentity(plan.tenantId, plan.organizationId, plan.companyId, plan.sourceId, plan.sourceVersion, plan.effectiveDate, plan.occurredAt);
  boundedText(plan.operationKey, "reversal operation key", 240);
  boundedText(plan.originalOperationKey, "original operation key", 240);
  if (plan.operationKey === plan.originalOperationKey) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_ORIGINAL_OPERATION_INVALID", "Reversal operation must differ from the original operation.");
  boundedText(plan.reason, "reversal reason", 500);
  validatePlan({
    operationKey: plan.operationKey,
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    companyId: plan.companyId,
    source: plan.source,
    sourceId: plan.sourceId,
    sourceVersion: plan.sourceVersion,
    ruleSetVersion: "reversal",
    effectiveDate: plan.effectiveDate,
    occurredAt: plan.occurredAt,
    description: plan.reason,
    lines: plan.lines,
  });
  return plan;
}

function buildPlan<TSource extends AccountingIntegrationSource, TEvent extends { readonly source: TSource; readonly tenantId: string; readonly organizationId: string; readonly companyId: string; readonly effectiveDate: string; readonly occurredAt: string }, TRule extends AccountingIntegrationRule & { readonly amountField: string }>(
  event: TEvent,
  sourceId: string,
  sourceVersion: number,
  rules: { readonly source: TSource; readonly version: string; readonly rules: readonly TRule[] },
  amounts: Readonly<Record<string, Money>>,
  descriptionPrefix: string,
): AccountingIntegrationPlan {
  const lines = rules.rules.flatMap((rule) => {
    const amount = amounts[rule.amountField];
    if (!amount) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", `Mapping ${rule.id} refers to an unsupported source amount.`);
    if (amount.minorAmount === 0n) return [];
    return [
      Object.freeze({ accountId: rule.debitAccountId, side: "debit" as const, amount, ruleId: rule.id, ruleVersion: rule.version }),
      Object.freeze({ accountId: rule.creditAccountId, side: "credit" as const, amount, ruleId: rule.id, ruleVersion: rule.version }),
    ];
  });
  if (lines.length === 0) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_AMOUNT_INVALID", "At least one mapped source amount must be positive.");
  const plan: AccountingIntegrationPlan = Object.freeze({
    operationKey: operationKey(event.source, event.tenantId, event.organizationId, event.companyId, sourceId, sourceVersion),
    tenantId: event.tenantId,
    organizationId: event.organizationId,
    companyId: event.companyId,
    source: event.source,
    sourceId,
    sourceVersion,
    ruleSetVersion: rules.version,
    effectiveDate: event.effectiveDate,
    occurredAt: event.occurredAt,
    description: `${descriptionPrefix} ${sourceId}`,
    lines: Object.freeze(lines),
  });
  validatePlan(plan);
  return plan;
}

function validateRuleSet(ruleSet: { readonly source: AccountingIntegrationSource; readonly version: string; readonly rules: readonly (AccountingIntegrationRule & { readonly amountField: string })[] }, source: AccountingIntegrationSource): void {
  if (ruleSet.source !== source || ruleSet.rules.length === 0) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULESET_INVALID", "Rule set does not match the source or has no mappings.");
  boundedText(ruleSet.version, "rule set version", 64);
  const ruleIds = new Set<string>();
  for (const rule of ruleSet.rules) {
    boundedText(rule.id, "rule identifier", 128);
    boundedText(rule.version, "rule version", 64);
    boundedText(rule.debitAccountId, "debit account identifier", 128);
    boundedText(rule.creditAccountId, "credit account identifier", 128);
    if (rule.debitAccountId === rule.creditAccountId || ruleIds.has(rule.id)) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_RULE_INVALID", "Mappings require distinct accounts and unique rule identifiers.");
    ruleIds.add(rule.id);
  }
}

function validateEventIdentity(tenantId: string, organizationId: string, companyId: string, sourceId: string, sourceVersion: number, effectiveDate: string, occurredAt: string): void {
  boundedText(tenantId, "tenant identifier", 128);
  boundedText(organizationId, "organization identifier", 128);
  boundedText(companyId, "company identifier", 128);
  boundedText(sourceId, "source identifier", 128);
  if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 1) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_IDENTIFIER_INVALID", "Source version must be a positive safe integer.");
  validateLocalDate(effectiveDate);
  validateInstant(occurredAt);
}

function validatePlan(plan: AccountingIntegrationPlan): void {
  validateEventIdentity(plan.tenantId, plan.organizationId, plan.companyId, plan.sourceId, plan.sourceVersion, plan.effectiveDate, plan.occurredAt);
  boundedText(plan.operationKey, "operation key", 240);
  boundedText(plan.ruleSetVersion, "rule set version", 64);
  boundedText(plan.description, "journal description", 500);
  if (plan.lines.length < 2) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_UNBALANCED", "A journal plan needs at least one debit and one credit line.");
  let debit = 0n;
  let credit = 0n;
  for (const line of plan.lines) {
    boundedText(line.accountId, "account identifier", 128);
    boundedText(line.ruleId, "rule identifier", 128);
    boundedText(line.ruleVersion, "rule version", 64);
    const amount = requireVesAmount(line.amount, "journal line");
    if (amount.minorAmount <= 0n) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_AMOUNT_INVALID", "Journal lines must be positive.");
    if (line.side === "debit") debit += amount.minorAmount; else if (line.side === "credit") credit += amount.minorAmount; else throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_UNBALANCED", "Journal line side is invalid.");
  }
  if (debit !== credit) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_UNBALANCED", "Journal debits must equal credits.");
}

function requireVesAmount(amount: Money, label: string): Money {
  if (amount.currency.code !== "VES" || amount.currency.minorUnit > 4 || amount.minorAmount < 0n) throw new AccountingIntegrationFailure(amount.currency.code !== "VES" || amount.currency.minorUnit > 4 ? "ACCOUNTING_INTEGRATION_CURRENCY_INVALID" : "ACCOUNTING_INTEGRATION_AMOUNT_INVALID", `${label} must be a non-negative VES amount with no more than four decimal places.`);
  const normalized = moneyFromMinor(amount.minorAmount, amount.currency);
  if (!sameCurrency(normalized.currency, amount.currency)) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_CURRENCY_INVALID", `${label} currency is invalid.`);
  const [integerPart = "0"] = moneyToDecimal(normalized).replace("-", "").split(".");
  if (integerPart.length > 14) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_AMOUNT_INVALID", `${label} exceeds the supported NUMERIC(18,4) range.`);
  return normalized;
}

function operationKey(source: AccountingIntegrationSource, tenantId: string, organizationId: string, companyId: string, sourceId: string, sourceVersion: number): string {
  const key = ["accounting-event", source, tenantId, organizationId, companyId, sourceId, String(sourceVersion)]
    .map((component) => `${component.length}:${component}`)
    .join("|");
  if (key.length > 240) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_IDENTIFIER_INVALID", "Operation key is too long.");
  return key;
}

function reconcilePayrollAmounts(amounts: Readonly<{
  readonly gross_earnings: Money;
  readonly employee_deductions: Money;
  readonly net_pay: Money;
  readonly employer_contributions?: Money;
}>): void {
  const currency = amounts.gross_earnings.currency;
  const components = [amounts.employee_deductions, amounts.net_pay, amounts.employer_contributions].filter(
    (amount): amount is Money => amount !== undefined,
  );
  if (components.some((amount) => !sameCurrency(currency, amount.currency))) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_CURRENCY_INVALID", "Payroll accounting amounts must use the same VES currency scale.");
  }
  if (amounts.gross_earnings.minorAmount !== amounts.employee_deductions.minorAmount + amounts.net_pay.minorAmount) {
    throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_AMOUNT_INVALID", "Payroll gross earnings must equal employee deductions plus net pay.");
  }
}

function boundedText(value: string, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_IDENTIFIER_INVALID", `${label} is invalid.`);
  return value.trim();
}

function validateLocalDate(value: string): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_DATE_INVALID", "Effective date must be an ISO calendar date.");
  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_DATE_INVALID", "Effective date must exist.");
}

function validateInstant(value: string): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new AccountingIntegrationFailure("ACCOUNTING_INTEGRATION_DATE_INVALID", "Occurrence time must be an ISO instant.");
}
