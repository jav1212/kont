import { addDecimal, compareDecimal, exactDecimal } from "@kontave/monetary/domain";
import { PayablesFailure } from "../domain/failure";
import { validatePayablesDate } from "../domain/model";
import type { PayablesCommandScope, PayablesCommandResult, PayablesDisbursementCommand, PayablesIslrCalculatorPort, PayablesRepository, PayablesValuationPort, PayablesValuedCommand, PayablesWithholdingInput, PayablesWriteCommand } from "./commands";

/** Executes one validated idempotent payables command through the owning repository.
 * @param repository - Payables persistence boundary.
 * @param valuation - Server-side VES valuation; required before any document-creating or disbursement command can run.
 * @param islr - Server-side ISLR calculator; required before a payment can withhold ISLR.
 * @returns A configured command use case.
 * @throws Never; operation failures are returned as rejected typed repository errors.
 */
export function createExecutePayablesCommand(repository: PayablesRepository, valuation?: PayablesValuationPort, islr?: PayablesIslrCalculatorPort): {
  /** @param scope - Trusted tenant, organization, company and actor scope. @param command - Idempotent command from an authorized boundary. @returns The persisted command receipt. @throws {import("../domain/failure").PayablesFailure} When validation, valuation, access, concurrency or persistence rejects the command. */
  execute(scope: PayablesCommandScope, command: PayablesWriteCommand): Promise<PayablesCommandResult>;
} {
  return {
    async execute(scope, command) {
      validateCommand(command);
      if (isDisbursement(command)) return repository.execute(scope, await valueDisbursement(scope, command, valuation, islr));
      if (!isValuedCommand(command)) return repository.execute(scope, command);
      if (!valuation) throw new PayablesFailure("UNAVAILABLE", "Payables valuation is not configured for document creation.");
      // The client may send a snapshot, but only the server-resolved one is persisted.
      const rateSnapshot = await valuation.value({ organizationId: scope.organizationId, companyId: scope.companyId, currency: command.currency, amount: command.principal, asOf: command.issuedAt });
      return repository.execute(scope, { ...command, rateSnapshot });
    },
  };
}

function isDisbursement(command: PayablesWriteCommand): command is PayablesDisbursementCommand {
  return command.kind === "execute_supplier_payment" || command.kind === "execute_payment_batch";
}

// Replaces every client-supplied valuation with server-resolved facts: the payment
// money, the payment-date rate of each foreign debt currency and the ISLR tariff.
async function valueDisbursement(scope: PayablesCommandScope, command: PayablesDisbursementCommand, valuation: PayablesValuationPort | undefined, islr: PayablesIslrCalculatorPort | undefined): Promise<PayablesDisbursementCommand> {
  if (!valuation) throw new PayablesFailure("UNAVAILABLE", "Payables valuation is not configured for payments.");
  const base = { organizationId: scope.organizationId, companyId: scope.companyId, asOf: command.occurredAt };
  const snapshot = await valuation.value({ ...base, currency: command.money.currency, amount: command.money.amount });
  const money = { amount: command.money.amount, currency: command.money.currency, operationalValue: { baseCurrency: "VES" as const, amount: snapshot.amount, rate: snapshot.rate, source: snapshot.source, asOf: snapshot.effectiveDate, policyVersion: snapshot.policyVersion, rounding: "half_up" as const } };
  const rates: Record<string, { readonly rate: string; readonly source: string }> = {};
  for (const currency of new Set(command.debtCurrencies ?? [])) {
    if (currency === "VES" || currency === command.money.currency) continue;
    const rate = await valuation.value({ ...base, currency, amount: "1" });
    rates[currency] = { rate: rate.rate, source: rate.source };
  }
  const withholdings = (command.withholdings ?? []).map((item) => resolveWithholding(item, islr));
  return { ...command, money, rates, withholdings };
}

function resolveWithholding(item: PayablesWithholdingInput, islr: PayablesIslrCalculatorPort | undefined): PayablesWithholdingInput {
  if (item.kind === "vat") return { id: item.id, documentId: item.documentId, kind: "vat", ...(item.rate ? { rate: item.rate } : {}), ...(item.taxableBaseVes ? { taxableBaseVes: item.taxableBaseVes } : {}) };
  if (!islr) throw new PayablesFailure("UNAVAILABLE", "ISLR calculation is not configured.");
  if (!item.conceptCode || !item.taxableBaseVes || !item.taxUnitValue) throw new PayablesFailure("INVALID", "ISLR needs a concept, a taxable base and the tax unit value.");
  const tariff = islr.calculate({ conceptCode: item.conceptCode, taxableBaseVes: item.taxableBaseVes, taxUnitValue: item.taxUnitValue });
  if (!tariff) throw new PayablesFailure("INVALID", "The law requires no ISLR withholding for this base and concept.");
  return { id: item.id, documentId: item.documentId, kind: "islr", conceptCode: item.conceptCode, taxableBaseVes: item.taxableBaseVes, taxUnitValue: item.taxUnitValue, rate: tariff.rate, subtrahendVes: tariff.subtrahendVes };
}

function isValuedCommand(command: PayablesWriteCommand): command is PayablesValuedCommand {
  return command.kind === "create_manual_document" || command.kind === "import_opening_document" || command.kind === "create_adjustment";
}

function validateCommand(command: PayablesWriteCommand): void {
  if (!command.idempotencyKey?.trim() || !command.correlationId?.trim()) throw new PayablesFailure("INVALID", "Payables commands need an idempotency key and correlation id.");
  switch (command.kind) {
    case "create_manual_document":
    case "import_opening_document":
    case "create_adjustment": {
      requireText(command.documentId, "Document id"); requireText(command.supplierId, "Supplier"); requireText(command.concept, "Concept");
      if (!/^[A-Z]{3}$/.test(command.currency)) throw new PayablesFailure("INVALID", "Currency must be an uppercase three-letter code.");
      positiveAmount(command.principal);
      validatePayablesDate(command.issuedAt, "Issue date");
      if (command.kind === "import_opening_document") { requireText(command.documentNumber, "Document number"); requireText(command.evidence, "Evidence"); }
      if (command.kind === "create_adjustment") {
        requireText(command.reason, "Reason");
        if (command.direction !== "positive" && command.direction !== "negative") throw new PayablesFailure("INVALID", "Adjustment direction must be positive or negative.");
        if (command.direction === "positive") dueNotBefore(command.dueAt, command.issuedAt);
      } else dueNotBefore(command.dueAt, command.issuedAt);
      return;
    }
    case "apply_credit": {
      requireText(command.creditDocumentId, "Credit document");
      validatePayablesDate(command.occurredAt, "Application date");
      if (!Array.isArray(command.allocations) || command.allocations.length < 1 || command.allocations.length > 50) throw new PayablesFailure("INVALID", "A credit application needs between 1 and 50 documents.");
      if (new Set(command.allocations.map((item) => item.documentId)).size !== command.allocations.length) throw new PayablesFailure("INVALID", "A document can appear only once in a credit application.");
      for (const item of command.allocations) { requireText(item.applicationId, "Application id"); requireText(item.documentId, "Document"); positiveAmount(item.amount); }
      return;
    }
    case "reverse_credit_application": requireText(command.applicationId, "Application id"); requireText(command.reason, "Reason"); return;
    case "create_installment_plan": {
      requireText(command.planId, "Plan id"); requireText(command.documentId, "Document"); expectedVersion(command.expectedVersion);
      if (!Array.isArray(command.installments) || command.installments.length < 2 || command.installments.length > 60) throw new PayablesFailure("INVALID", "An installment plan needs between 2 and 60 installments.");
      // The exact total is enforced in SQL against the locked open balance, which the client cannot know atomically.
      for (const item of command.installments) { requireText(item.documentId, "Installment id"); positiveAmount(item.amount); validatePayablesDate(item.dueAt, "Installment due date"); }
      if (new Set(command.installments.map((item) => item.documentId)).size !== command.installments.length) throw new PayablesFailure("INVALID", "Installment ids must be unique.");
      return;
    }
    case "undo_installment_plan": requireText(command.planId, "Plan id"); requireText(command.reason, "Reason"); expectedVersion(command.expectedVersion); return;
    case "change_due_date": requireText(command.reason, "Reason"); expectedVersion(command.expectedVersion); validatePayablesDate(command.dueAt, "Due date"); return;
    case "execute_supplier_payment":
    case "execute_payment_batch": {
      if (command.kind === "execute_supplier_payment") {
        requireText(command.paymentId, "Payment id"); requireText(command.supplierId, "Supplier");
        if (!Array.isArray(command.lines) || command.lines.length < 1 || command.lines.length > 100) throw new PayablesFailure("INVALID", "A payment needs between 1 and 100 documents.");
        if (new Set(command.lines.map((line) => line.documentId)).size !== command.lines.length) throw new PayablesFailure("INVALID", "A document can appear only once in a payment.");
        let total = exactDecimal("0");
        for (const line of command.lines) { requireText(line.lineId, "Line id"); requireText(line.documentId, "Document"); positiveAmount(line.amount); total = addDecimal(total, exactDecimal(line.amount)); }
        // D4: no advances; the disbursement is exactly what the lines apply.
        if (compareDecimal(total, exactDecimal(command.money.amount)) !== 0) throw new PayablesFailure("INVALID", "The payment amount must equal the sum of its lines.");
      } else { requireText(command.batchId, "Batch"); expectedVersion(command.expectedVersion); }
      if (!["cash", "transfer", "check"].includes(command.method)) throw new PayablesFailure("INVALID", "Payment method must be cash, transfer or check.");
      if ((command.method === "cash") !== (command.account?.kind === "cash_box")) throw new PayablesFailure("INVALID", "Cash payments use a cash box; transfers and checks use a bank account.");
      requireText(command.account?.id, "Treasury account");
      if (command.method === "transfer") requireText(command.reference, "Transfer reference");
      if (command.method === "check") requireText(command.checkbookId, "Checkbook");
      if (!/^[A-Z]{3}$/.test(command.money?.currency ?? "")) throw new PayablesFailure("INVALID", "Payment currency must be an uppercase three-letter code.");
      positiveAmount(command.money.amount);
      validatePayablesDate(command.occurredAt, "Payment date");
      for (const item of command.withholdings ?? []) {
        requireText(item.id, "Withholding id"); requireText(item.documentId, "Withholding document");
        if (item.kind !== "vat" && item.kind !== "islr") throw new PayablesFailure("INVALID", "Withholding kind must be VAT or ISLR.");
        if (item.kind === "vat" && item.rate !== "75" && item.rate !== "100") throw new PayablesFailure("INVALID", "VAT withholding is 75% or 100%.");
      }
      return;
    }
    case "void_supplier_payment": requireText(command.paymentId, "Payment"); requireText(command.reason, "Reason"); expectedVersion(command.expectedVersion); return;
    case "reverse_supplier_payment": requireText(command.paymentId, "Payment"); requireText(command.reason, "Reason"); expectedVersion(command.expectedVersion); validatePayablesDate(command.reversalDate, "Reversal date"); return;
    case "configure_policy":
      if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) throw new PayablesFailure("INVALID", "An expected policy version is required.");
      if (command.negativeAdjustmentThresholdVes !== null) positiveAmount(command.negativeAdjustmentThresholdVes);
      return;
    case "decide_adjustment":
      requireText(command.documentId, "Document");
      if (command.decision !== "approved" && command.decision !== "rejected") throw new PayablesFailure("INVALID", "Decision must be approved or rejected.");
      return;
    case "mark_withholdings_declared":
      if (command.withholdingKind !== "vat" && command.withholdingKind !== "islr") throw new PayablesFailure("INVALID", "Withholding kind must be VAT or ISLR.");
      if (!/^\d{4}(-\d{2})?$/.test(command.fiscalPeriod)) throw new PayablesFailure("INVALID", "Fiscal period must be YYYY or YYYY-MM.");
      return;
    case "post_payment_accounting":
    case "reverse_payment_accounting": requireText(command.paymentId, "Payment"); return;
    default: return;
  }
}

function requireText(value: string | undefined, label: string): void {
  if (typeof value !== "string" || !value.trim()) throw new PayablesFailure("INVALID", `${label} is required.`);
}

function positiveAmount(value: string): void {
  let amount;
  try { amount = exactDecimal(value); } catch { throw new PayablesFailure("INVALID", "Amounts must be exact decimal text."); }
  if (compareDecimal(amount, exactDecimal("0")) <= 0 || !/^\d+(\.\d{1,2})?$/.test(amount)) throw new PayablesFailure("INVALID", "Amounts must be positive with at most two decimals.");
}

function dueNotBefore(dueAt: string | undefined, issuedAt: string): void {
  if (!dueAt) throw new PayablesFailure("INVALID", "Due date is required.");
  validatePayablesDate(dueAt, "Due date");
  if (dueAt < issuedAt) throw new PayablesFailure("INVALID", "Due date cannot precede the issue date.");
}

function expectedVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new PayablesFailure("INVALID", "An expected version is required.");
}
