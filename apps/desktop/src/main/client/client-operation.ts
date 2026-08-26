import type {
  ClientFailure,
  ClientOperationResult,
} from "@kontave/client-contracts";

/** Expected portable-client failure reified inside Electron main. */
export class ClientOperationFailure extends Error {
  /** Stable failure code supplied by the portable client. */
  get code(): string {
    return this.failure.code;
  }

  /** Correlation identifier supplied by the remote boundary when available. */
  get requestId(): string | null {
    return this.failure.requestId;
  }

  /** Whether retry or user recovery may succeed. */
  get recoverable(): boolean {
    return this.failure.recoverable;
  }

  /**
   * Creates an error from a serializable client failure.
   * @param failure - Failure returned by a portable client feature.
   */
  constructor(readonly failure: ClientFailure) {
    super(failure.message);
    this.name = "ClientOperationFailure";
  }
}

/**
 * Extracts a successful portable-client value for main-process orchestration.
 * @param result - Serializable feature operation result.
 * @returns Successful operation value.
 * @throws ClientOperationFailure when the feature reports an expected failure.
 */
export function requireClientValue<T>(result: ClientOperationResult<T>): T {
  if (result.ok) return result.value;
  throw new ClientOperationFailure(result.error);
}

/**
 * Locates a portable-client failure inside a bounded error cause chain.
 * @param cause - Unknown failure caught at a main-process orchestration boundary.
 * @returns The client failure when present, otherwise `null`.
 */
export function findClientOperationFailure(
  cause: unknown,
): ClientOperationFailure | null {
  let current = cause;
  const visited = new Set<Error>();

  for (let depth = 0; depth < 16 && current instanceof Error; depth += 1) {
    if (current instanceof ClientOperationFailure) return current;
    if (visited.has(current)) break;
    visited.add(current);
    current = current.cause;
  }

  return null;
}
