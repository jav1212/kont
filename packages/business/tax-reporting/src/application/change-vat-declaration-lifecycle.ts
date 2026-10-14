import { TaxReportingFailure, recordVatDeclarationPayment, submitVatDeclaration, voidVatDeclaration, type VatDeclaration } from "../domain";
import type { VatDeclarationRepository } from "./prepare-vat-declaration";

/** Authenticated command to advance an internal return's evidenced lifecycle. */
export type ChangeVatDeclarationLifecycleCommand =
  | { readonly kind: "submit"; readonly evidence: { readonly reference: string; readonly submittedAt: string } }
  | { readonly kind: "record_payment"; readonly evidence: { readonly reference: string; readonly amount: VatDeclaration["summary"]["payable"]; readonly paidAt: string } }
  | { readonly kind: "void"; readonly evidence: { readonly reason: string; readonly voidedAt: string; readonly actorId: string } };

/** Persists an append-only declaration lifecycle revision with optimistic concurrency. */
export class ChangeVatDeclarationLifecycle {
  /**
   * Creates the lifecycle command handler.
   * @param declarations - Revisioned declaration repository.
   * @returns Handler for submission, payment, and void evidence.
   * @throws No expected failure during construction.
   */
  constructor(private readonly declarations: VatDeclarationRepository) {}

  /**
   * Applies one explicit lifecycle action and persists it as the next revision.
   * @param input - Current declaration, action evidence, actor, idempotency key, and expected revision.
   * @returns Persisted declaration and idempotent replay indicator.
   * @throws {TaxReportingFailure} When the command is invalid or its revision is stale.
   */
  async execute(input: {
    readonly declaration: VatDeclaration;
    readonly command: ChangeVatDeclarationLifecycleCommand;
    readonly actorId: string;
    readonly idempotencyKey: string;
    readonly expectedRevision: number;
  }): Promise<{ readonly declaration: VatDeclaration; readonly replayed: boolean }> {
    if (!input.actorId.trim() || !input.idempotencyKey.trim() || input.expectedRevision !== input.declaration.revision) {
      throw new TaxReportingFailure("TAX_REPORTING_CONCURRENCY_CONFLICT", "Lifecycle command requires an actor, idempotency key, and the current revision.");
    }
    if (input.command.kind === "void" && input.command.evidence.actorId.trim() !== input.actorId.trim()) {
      throw new TaxReportingFailure("TAX_REPORTING_DECLARATION_INVALID", "Void evidence actor must match the authenticated command actor.");
    }
    const revision = input.command.kind === "submit"
      ? submitVatDeclaration(input.declaration, input.command.evidence)
      : input.command.kind === "record_payment"
        ? recordVatDeclarationPayment(input.declaration, input.command.evidence)
        : voidVatDeclaration(input.declaration, input.command.evidence);
    return this.declarations.save({
      declaration: revision,
      actorId: input.actorId.trim(),
      idempotencyKey: input.idempotencyKey.trim(),
      expectedRevision: input.expectedRevision,
    });
  }
}
