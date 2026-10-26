import { AccountingFailure, type AccountingScope } from "../domain";
import {
  AccountingCommandEngine,
  type AccountingAuthorization,
} from "../application";

/** In-process repository fixture delegating all business transitions to the portable application engine. */
export class InMemoryAccountingRepository extends AccountingCommandEngine {}

/** Permissive authorization fixture that records each requested permission. */
export class AllowAccountingAuthorization implements AccountingAuthorization {
  /** Permissions requested through this fixture. */
  public readonly operations: Array<
    "accounting.read" | "accounting.chart.manage"
  > = [];
  /** {@inheritDoc AccountingAuthorization.require} */
  public async require(
    _scope: AccountingScope,
    operation: "accounting.read" | "accounting.chart.manage",
  ): Promise<void> {
    this.operations.push(operation);
  }
}
/** Rejecting authorization fixture for permission-denial tests. */
export class DenyAccountingAuthorization implements AccountingAuthorization {
  /** {@inheritDoc AccountingAuthorization.require} */
  public async require(
    _scope: AccountingScope,
    _operation: "accounting.read" | "accounting.chart.manage",
  ): Promise<void> {
    throw new AccountingFailure(
      "FORBIDDEN",
      "The actor lacks accounting permission.",
    );
  }
}
