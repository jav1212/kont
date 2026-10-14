import { addMoney, moneyFromMinor, sameCurrency, type Money } from "@kontave/monetary/domain";
import { TaxReportingFailure } from "./tax-reporting-failure";
import type { TaxReportingScope } from "./tax-reporting-fact";

/** Lifecycle of an internal VAT declaration record. Submission is evidence, never a legal certification. */
export type VatDeclarationStatus = "draft" | "prepared" | "submitted" | "paid" | "void";

/** Versioned internal template/mapping for a form representation. */
export interface VatFormTemplate {
  readonly id: string;
  readonly version: string;
  readonly mapping: Readonly<Record<string, string>>;
}

/** Reproducible amounts used by a declaration snapshot. */
export interface VatDeclarationSummary {
  readonly debitTax: Money;
  readonly deductibleCredit: Money;
  readonly withheldTax: Money;
  readonly carryForwardIn: Money;
  readonly adjustments: Money;
  readonly payable: Money;
}

/** Immutable declaration history record. */
export interface VatDeclaration {
  readonly id: string;
  readonly scope: TaxReportingScope;
  readonly period: string;
  readonly revision: number;
  readonly status: VatDeclarationStatus;
  readonly summary: VatDeclarationSummary;
  readonly template: VatFormTemplate;
  readonly factIds: readonly string[];
  readonly reconciliationIssueFactIds: readonly string[];
  readonly submittedEvidence: { readonly reference: string; readonly submittedAt: string } | null;
  readonly voidEvidence?: { readonly reason: string; readonly voidedAt: string; readonly actorId: string } | null;
  readonly payments: readonly { readonly reference: string; readonly amount: Money; readonly paidAt: string }[];
  readonly createdAt: string;
}

/**
 * Validates and freezes a declaration lifecycle snapshot, including its payment reconciliation.
 * @param declaration - Candidate declaration revision.
 * @returns A validated immutable declaration.
 * @throws {TaxReportingFailure} When identity, currency, evidence, or lifecycle totals are inconsistent.
 */
export function vatDeclaration(declaration: VatDeclaration): VatDeclaration {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(declaration.period)
    || !Number.isInteger(declaration.revision)
    || declaration.revision < 1
    || !declaration.id.trim()
    || !declaration.template.id.trim()
    || !declaration.template.version.trim()) {
    invalid("Declaration identity or template is invalid.");
  }

  const currency = declaration.summary.payable.currency;
  const summaryAmounts = [declaration.summary.debitTax, declaration.summary.deductibleCredit, declaration.summary.withheldTax,
    declaration.summary.carryForwardIn, declaration.summary.adjustments];
  if (summaryAmounts.some((amount) => !sameCurrency(amount.currency, currency))) {
    invalid("Declaration summary amounts must use one currency.");
  }

  if (declaration.reconciliationIssueFactIds.length > 0 && declaration.status !== "draft" && declaration.status !== "void") {
    invalid("A declaration with unreconciled facts cannot be prepared.");
  }
  if (declaration.status === "void") {
    const evidence = declaration.voidEvidence;
    if (!evidence || !evidence.reason.trim() || !evidence.actorId.trim() || !isInstant(evidence.voidedAt)
      || declaration.submittedEvidence !== null || declaration.payments.length > 0) {
      invalid("Voiding requires a reason, time, and actor before external submission or payment.");
    }
  } else if (declaration.voidEvidence != null) {
    invalid("Void evidence is only valid for a void declaration.");
  }

  const submitted = declaration.status === "submitted" || declaration.status === "paid";
  if (submitted) {
    const evidence = declaration.submittedEvidence;
    if (!evidence || !evidence.reference.trim() || !isInstant(evidence.submittedAt)) {
      invalid("Submission requires external evidence.");
    }
  } else if (declaration.submittedEvidence !== null) {
    invalid("Submission evidence is only valid after the declaration is submitted.");
  }

  let paymentTotal: Money = moneyFromMinor(0n, currency);
  const references = new Set<string>();
  for (const payment of declaration.payments) {
    if (!payment.reference.trim() || !isInstant(payment.paidAt) || payment.amount.minorAmount <= 0n
      || !sameCurrency(payment.amount.currency, currency) || references.has(payment.reference)) {
      invalid("Payment evidence must be unique, positive, dated, and use the declaration currency.");
    }
    references.add(payment.reference);
    paymentTotal = addMoney(paymentTotal, payment.amount);
  }

  if (!submitted && declaration.payments.length > 0) invalid("Payments require a submitted declaration.");
  if (declaration.status === "paid" && (declaration.summary.payable.minorAmount <= 0n
    || paymentTotal.minorAmount !== declaration.summary.payable.minorAmount)) {
    invalid("Paid declaration evidence must exactly settle a positive payable amount.");
  }
  if (declaration.status === "submitted" && declaration.summary.payable.minorAmount > 0n
    && paymentTotal.minorAmount >= declaration.summary.payable.minorAmount) {
    invalid("A fully settled declaration must use the paid status.");
  }
  if (declaration.status === "submitted" && declaration.summary.payable.minorAmount <= 0n && declaration.payments.length > 0) {
    invalid("A non-positive declaration payable cannot accept payments.");
  }

  return Object.freeze({
    ...declaration,
    summary: Object.freeze({ ...declaration.summary }),
    template: Object.freeze({ ...declaration.template, mapping: Object.freeze({ ...declaration.template.mapping }) }),
    factIds: Object.freeze([...declaration.factIds]),
    reconciliationIssueFactIds: Object.freeze([...declaration.reconciliationIssueFactIds]),
    submittedEvidence: declaration.submittedEvidence === null ? null : Object.freeze({ ...declaration.submittedEvidence }),
    ...(declaration.voidEvidence == null ? { voidEvidence: null } : { voidEvidence: Object.freeze({ ...declaration.voidEvidence }) }),
    payments: Object.freeze(declaration.payments.map((payment) => Object.freeze({ ...payment }))),
  });
}

function isInstant(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function invalid(message: string): never {
  throw new TaxReportingFailure("TAX_REPORTING_DECLARATION_INVALID", message);
}
