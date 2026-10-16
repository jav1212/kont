import { TreasuryFailure } from "../domain/failure";
import { ExecuteTreasuryCommand } from "./repository";
import type { RecordCheckDeliveryCommand, TreasuryCommandResult } from "./commands";

/** One outcome from a bounded best-effort batch of independent check deliveries. */
export type CheckDeliveryBatchOutcome =
  | { readonly checkId: string; readonly deliveryEventId: string; readonly status: "recorded"; readonly result: TreasuryCommandResult }
  | { readonly checkId: string; readonly deliveryEventId: string; readonly status: "failed"; readonly errorCode: TreasuryFailure["code"]; readonly message: string };

/** Executes TES-020 delivery actions independently so one stale check does not hide other results. */
export class RecordCheckDeliveriesBatch {
  /** @param executeCommand - The same validated atomic command service used for single delivery actions. */
  public constructor(private readonly executeCommand: ExecuteTreasuryCommand) {}

  /**
   * Records each check delivery in order and returns an outcome for every item.
   * @param commands - Between one and one hundred delivery commands sharing one authorized company scope.
   * @returns Ordered per-check success or safe failure details; completed items remain independently committed.
   * @throws {TreasuryFailure} When the batch envelope is invalid or an unexpected non-domain failure escapes command execution.
   */
  public async execute(commands: readonly RecordCheckDeliveryCommand[]): Promise<readonly CheckDeliveryBatchOutcome[]> {
    validateBatch(commands);
    const outcomes: CheckDeliveryBatchOutcome[] = [];
    for (const command of commands) {
      try {
        const result = await this.executeCommand.execute(command);
        outcomes.push({ checkId: command.checkId, deliveryEventId: command.deliveryEventId, status: "recorded", result });
      } catch (cause: unknown) {
        if (!(cause instanceof TreasuryFailure)) throw cause;
        outcomes.push({ checkId: command.checkId, deliveryEventId: command.deliveryEventId, status: "failed", errorCode: cause.code, message: cause.message });
      }
    }
    return outcomes;
  }
}

function validateBatch(commands: readonly RecordCheckDeliveryCommand[]): void {
  if (!Array.isArray(commands) || commands.length < 1 || commands.length > 100) throw new TreasuryFailure("INVALID", "A check-delivery batch must contain between one and one hundred items.");
  const first = commands[0];
  if (!first) throw new TreasuryFailure("INVALID", "A check-delivery batch cannot be empty.");
  const checkIds = new Set<string>();
  const deliveryIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  for (const command of commands) {
    if (command.kind !== "record_check_delivery" || command.tenantId !== first.tenantId || command.organizationId !== first.organizationId || command.companyId !== first.companyId || command.actorId !== first.actorId) throw new TreasuryFailure("INVALID", "Every batch item must be a check delivery in the same authorized company scope.");
    if (checkIds.has(command.checkId) || deliveryIds.has(command.deliveryEventId) || idempotencyKeys.has(command.idempotencyKey)) throw new TreasuryFailure("INVALID", "A check, delivery event or idempotency key may appear only once in a batch.");
    checkIds.add(command.checkId);
    deliveryIds.add(command.deliveryEventId);
    idempotencyKeys.add(command.idempotencyKey);
  }
}
