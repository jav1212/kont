import { PayablesFailure } from "../domain/failure";
import type { ListPayablesQuery, PayablesCommandResult, PayablesRepository, PayablesWriteCommand, PayablesCommandScope, PayableListResult, PayablesReportQuery, PayablesReportResult } from "../application/commands";

/** Optional operations used to replace the Accounts Payable repository in tests. */
export interface PayablesRepositoryOverrides {
  /** Replace the write boundary with a deterministic test operation. */
  readonly execute?: (scope: PayablesCommandScope, command: PayablesWriteCommand) => Promise<PayablesCommandResult>;
  /** Replace the read boundary with deterministic rows and totals. */
  readonly list?: (query: ListPayablesQuery) => Promise<PayableListResult>;
  /** Replace the reports boundary with deterministic rows and totals. */
  readonly report?: (query: PayablesReportQuery) => Promise<PayablesReportResult>;
}

/**
 * Creates an explicit repository test double without adding infrastructure dependencies.
 *
 * @param overrides - Optional handlers for operations exercised by the test.
 * @returns Repository double that fails clearly when an operation is unconfigured.
 * @throws Never; unconfigured operations reject when invoked.
 */
export function createPayablesRepositoryStub(overrides: PayablesRepositoryOverrides = {}): PayablesRepository {
  return {
    async execute(scope, command) {
      if (!overrides.execute) throw new PayablesFailure("UNAVAILABLE", "No test execute handler was configured.");
      return overrides.execute(scope, command);
    },
    async list(query) {
      if (!overrides.list) throw new PayablesFailure("UNAVAILABLE", "No test query handler was configured.");
      return overrides.list(query);
    },
    async report(query) {
      if (!overrides.report) throw new PayablesFailure("UNAVAILABLE", "No test report handler was configured.");
      return overrides.report(query);
    },
  };
}
