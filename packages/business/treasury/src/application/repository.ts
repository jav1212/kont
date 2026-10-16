import { TreasuryFailure } from "../domain/failure";
import type { TreasuryScope } from "../domain/model";
import { validateTreasuryCommand, type TreasuryCommandResult, type TreasuryWriteCommand } from "./commands";

/** Atomic persistence boundary for all financial treasury commands. */
export interface TreasuryCommandRepository {
  /**
   * Commits one validated command, facts, source claims, audit and its idempotent receipt atomically.
   * @param scope - Authorized tenant, organization, company and actor scope.
   * @param command - Complete immutable command payload.
   * @returns Persisted result or the receipt of an identical prior command.
   * @throws {TreasuryFailure} When authorization, concurrency, source claims or persistence rejects the command.
   */
  execute(scope: TreasuryScope, command: TreasuryWriteCommand): Promise<TreasuryCommandResult>;
}
/** Executes one treasury command after portable validation. */
export class ExecuteTreasuryCommand {
  /** @param repository - Transactional treasury persistence boundary. */
  public constructor(private readonly repository: TreasuryCommandRepository) {}
  /** @param command - Complete treasury operation. @returns Its durable receipt. @throws {TreasuryFailure} When command validation or persistence fails. */
  public async execute(command: TreasuryWriteCommand): Promise<TreasuryCommandResult> {
    try { return await this.repository.execute(command, validateTreasuryCommand(command)); }
    catch (cause: unknown) { if (cause instanceof TreasuryFailure) throw cause; throw new TreasuryFailure("UNAVAILABLE", "Treasury repository is unavailable.", { cause }); }
  }
}
