import { PayablesFailure } from "../domain/failure";
import { validatePayablesDate } from "../domain/model";
import type { PayablesRepository, PayablesCommandResult } from "./commands";
import type { PayablesScope } from "../domain/model";

/** Input for an audited and version-checked due-date change. */
export interface ChangePayableDueDateInput extends PayablesScope {
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly changeId: string;
  readonly documentId: string;
  readonly dueAt: string;
  readonly reason: string;
  readonly expectedVersion: number;
}

/** Records a due-date change without mutating monetary terms. */
export class ChangePayableDueDate {
  /**
   * @param repository - Port for transactional, tenant-scoped persistence.
   * @returns A use case that changes a document's due date.
   * @throws {PayablesFailure} When the repository is missing.
   */
  public constructor(private readonly repository: PayablesRepository) {
    if (!repository) throw new PayablesFailure("INVALID", "Payables repository is required.");
  }

  /**
   * @param input - Authenticated scope, new date, reason and expected version.
   * @returns Persisted command receipt.
   * @throws {PayablesFailure} When input is invalid, the version conflicts or persistence fails.
   */
  public async execute(input: ChangePayableDueDateInput): Promise<PayablesCommandResult> {
    validatePayablesDate(input.dueAt, "Due date");
    if (!input.reason.trim() || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new PayablesFailure("INVALID", "A reason and expected payable version are required.");
    return this.repository.execute(input, { ...input, kind: "change_due_date" });
  }
}
