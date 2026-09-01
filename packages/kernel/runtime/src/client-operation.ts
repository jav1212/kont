import type { ClientFailure, ClientOperationResult } from "@kontave/client-contracts";

/** Error that restores a serialized portable-client failure to typed control flow. */
export class ClientOperationFailure extends Error {
  /** Stable portable failure code. */
  readonly code: string;
  /** Whether a user action or retry can recover the operation. */
  readonly recoverable: boolean;
  /** Remote correlation identifier when the boundary supplied one. */
  readonly requestId: string | null;

  /**
   * Creates a typed error from a serializable client failure.
   * @param failure - Failure returned by a portable client feature.
   */
  constructor(readonly failure: ClientFailure) {
    super(failure.message);
    this.name = "ClientOperationFailure";
    this.code = failure.code;
    this.recoverable = failure.recoverable;
    this.requestId = failure.requestId;
  }
}

/**
 * Extracts a successful portable-client value for platform orchestration.
 * @param result - Serializable result returned by a client feature.
 * @returns The successful operation value.
 * @throws {ClientOperationFailure} When the feature reports an expected failure.
 */
export function unwrapClientOperationResult<T>(result: ClientOperationResult<T>): T {
  if (result.ok) return result.value;
  throw new ClientOperationFailure(result.error);
}

/**
 * Finds a typed portable-client failure within a bounded error cause chain.
 * @param cause - Failure caught at a platform orchestration boundary.
 * @returns The portable failure when present, otherwise `null`.
 */
export function findClientOperationFailure(cause: unknown): ClientOperationFailure | null {
  let current = cause;
  const visited = new Set<Error>();
  for (let depth = 0; depth < 16 && current instanceof Error; depth += 1) {
    if (current instanceof ClientOperationFailure) return current;
    if (visited.has(current)) return null;
    visited.add(current);
    current = current.cause;
  }
  return null;
}
