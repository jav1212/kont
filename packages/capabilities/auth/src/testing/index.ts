import type { AccountSecurityRepository } from "../application";
import type { AccountSecurityState } from "../domain";

/** Serialized in-memory account-security repository for concurrency and rollback tests. */
export class InMemoryAccountSecurityRepository implements AccountSecurityRepository {
  private readonly states = new Map<string, AccountSecurityState>();
  private queue: Promise<void> = Promise.resolve();
  private failNextCommit = false;
  /** @param initial - Initial immutable security facts keyed by user ID. */
  constructor(initial: readonly AccountSecurityState[] = []) {
    for (const state of initial) this.states.set(key(state), copy(state));
  }
  /** Causes only the next transactional commit to fail without replacing persisted state. */
  failFollowingCommit(): void {
    this.failNextCommit = true;
  }
  /** Returns a detached current state for assertions. */
  snapshot(
    organizationId: string,
    userId: string,
  ): AccountSecurityState | null {
    const state = this.states.get(key({ organizationId, userId }));
    return state ? copy(state) : null;
  }
  async transact<T>(
    scope: { readonly organizationId: string; readonly userId: string },
    operation: (state: AccountSecurityState) => {
      readonly state: AccountSecurityState;
      readonly result: T;
    },
  ): Promise<T> {
    const current = this.queue.then(() => {
      const state = this.states.get(key(scope));
      if (!state) throw new Error("Account security state not found.");
      const next = operation(copy(state));
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error("Account security commit failed.");
      }
      this.states.set(key(scope), copy(next.state));
      return next.result;
    });
    this.queue = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }
}
function key(scope: {
  readonly organizationId: string;
  readonly userId: string;
}): string {
  return `${scope.organizationId}:${scope.userId}`;
}
function copy(state: AccountSecurityState): AccountSecurityState {
  return Object.freeze({
    ...state,
    failedAttempts: Object.freeze([...state.failedAttempts]),
  });
}
