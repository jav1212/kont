import { addMoney, moneyFromMinor, sameCurrency } from "@kontave/monetary/domain";
import { TaxReportingFailure } from "./tax-reporting-failure";
import { vatDeclaration, type VatDeclaration } from "./vat-declaration";

/** Provider evidence that an internal return was submitted to an external authority. */
export interface VatSubmissionEvidence {
  readonly reference: string;
  readonly submittedAt: string;
}

/** Evidence for one completed tax payment. */
export interface VatPaymentEvidence {
  readonly reference: string;
  readonly amount: VatDeclaration["summary"]["payable"];
  readonly paidAt: string;
}

/** Records external submission evidence on a prepared declaration revision.
 * @param declaration - Current immutable declaration revision.
 * @param evidence - Authority reference and submission timestamp.
 * @returns New submitted revision with preserved facts and template.
 * @throws {TaxReportingFailure} When state or evidence is invalid.
 */
export function submitVatDeclaration(declaration: VatDeclaration, evidence: VatSubmissionEvidence): VatDeclaration {
  if (declaration.status !== "prepared") invalid("Only a prepared declaration can be submitted.");
  const reference = required(evidence.reference, "submission reference");
  const submittedAt = instant(evidence.submittedAt);
  return vatDeclaration({ ...declaration, revision: declaration.revision + 1, status: "submitted", submittedEvidence: { reference, submittedAt } });
}

/** Records an evidenced tax payment without allowing overpayment or duplicate receipts.
 * @param declaration - Current immutable submitted declaration revision.
 * @param payment - Payment receipt with a positive amount and unique reference.
 * @returns New submitted or fully paid revision.
 * @throws {TaxReportingFailure} When state, amount, or evidence is invalid.
 */
export function recordVatDeclarationPayment(declaration: VatDeclaration, payment: VatPaymentEvidence): VatDeclaration {
  if (declaration.status !== "submitted") invalid("Only a submitted declaration can receive a payment.");
  const reference = required(payment.reference, "payment reference");
  const paidAt = instant(payment.paidAt);
  if (!sameCurrency(payment.amount.currency, declaration.summary.payable.currency) || payment.amount.minorAmount <= 0n) invalid("Payment must be positive and use the declaration currency.");
  if (declaration.payments.some((item) => item.reference === reference)) invalid("Payment reference is already recorded.");
  const paid = declaration.payments.reduce((total, item) => {
    if (!sameCurrency(total.currency, item.amount.currency)) invalid("Payment evidence uses mixed currencies.");
    return addMoney(total, item.amount);
  }, moneyFromMinor(0n, payment.amount.currency));
  const totalPaid = addMoney(paid, payment.amount);
  if (declaration.summary.payable.minorAmount <= 0n || totalPaid.minorAmount > declaration.summary.payable.minorAmount) invalid("Payment cannot exceed a positive declared payable amount.");
  return vatDeclaration({
    ...declaration,
    revision: declaration.revision + 1,
    status: totalPaid.minorAmount === declaration.summary.payable.minorAmount ? "paid" : "submitted",
    payments: [...declaration.payments, { reference, amount: payment.amount, paidAt }],
  });
}

/** Voids a draft or prepared internal declaration while retaining an audit reason.
 * @param declaration - Current immutable declaration revision.
 * @param evidence - Reason, timestamp, and authenticated actor requesting void.
 * @returns New void revision.
 * @throws {TaxReportingFailure} When external submission or payment has already occurred.
 */
export function voidVatDeclaration(declaration: VatDeclaration, evidence: { readonly reason: string; readonly voidedAt: string; readonly actorId: string }): VatDeclaration {
  if (declaration.status !== "draft" && declaration.status !== "prepared") invalid("A submitted declaration cannot be voided through the internal draft workflow.");
  if (declaration.payments.length > 0 || declaration.submittedEvidence !== null) invalid("A declaration with external lifecycle evidence cannot be voided.");
  return vatDeclaration({
    ...declaration,
    revision: declaration.revision + 1,
    status: "void",
    voidEvidence: { reason: required(evidence.reason, "void reason"), voidedAt: instant(evidence.voidedAt), actorId: required(evidence.actorId, "void actor") },
  });
}

function required(value: string, label: string): string {
  const result = value.trim();
  if (!result || result.length > 256) invalid(`Invalid ${label}.`);
  return result;
}

function instant(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) invalid("Lifecycle evidence requires an ISO timestamp.");
  return value;
}

function invalid(message: string): never {
  throw new TaxReportingFailure("TAX_REPORTING_DECLARATION_INVALID", message);
}
