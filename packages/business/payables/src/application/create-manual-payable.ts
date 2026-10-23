import { exactDecimal } from "@kontave/monetary/domain";
import { PayablesFailure } from "../domain/failure";
import { validatePayableDocument } from "../domain/model";
import type { PayablesRepository, PayablesCommandResult } from "./commands";
import type { PayablesScope } from "../domain/model";

/** Input required to record a manually supported supplier obligation. */
export interface CreateManualPayableInput extends PayablesScope {
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly documentId: string;
  readonly supplierId: string;
  readonly documentNumber: string;
  readonly concept: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly currency: string;
  readonly principal: string;
  readonly rateSnapshot: {
    readonly amount: string;
    readonly rate: string;
    readonly source: string;
    readonly effectiveDate: string;
    readonly policyVersion: string;
  };
}

/** Validates and persists an obligation that does not originate in a fiscal invoice. */
export class CreateManualPayable {
  /**
   * @param repository - Port for transactional, tenant-scoped persistence.
   * @returns A use case that creates manual obligations.
   * @throws {PayablesFailure} When the repository is missing.
   */
  public constructor(private readonly repository: PayablesRepository) {
    if (!repository) throw new PayablesFailure("INVALID", "Payables repository is required.");
  }

  /**
   * @param input - Authenticated scope, invoice facts and server-resolved valuation.
   * @returns Persisted command receipt.
   * @throws {PayablesFailure} When identity, amount, date, rate, permission or persistence is invalid.
   */
  public async execute(input: CreateManualPayableInput): Promise<PayablesCommandResult> {
    validatePayableDocument({
      id: input.documentId, supplierId: input.supplierId, sourceType: "manual", sourceId: input.documentId,
      kind: "manual_document", documentNumber: input.documentNumber, concept: input.concept,
      issuedAt: input.issuedAt, dueAt: input.dueAt, currency: input.currency,
      principal: exactDecimal(input.principal),
      rateSnapshot: { amount: exactDecimal(input.rateSnapshot.amount), baseCurrency: "VES", rate: exactDecimal(input.rateSnapshot.rate), source: input.rateSnapshot.source, effectiveDate: input.rateSnapshot.effectiveDate, policyVersion: input.rateSnapshot.policyVersion, rounding: "half_up" },
      status: "open", version: 1,
    });
    return this.repository.execute(input, {
      ...input,
      kind: "create_manual_document",
      rateSnapshot: { ...input.rateSnapshot, baseCurrency: "VES", rounding: "half_up" },
    });
  }
}
