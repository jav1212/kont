import type { ApiSuccess } from "@kontave/client-contracts";
import type { RemoteTransport } from "./index";

type EnvelopeExecutor = (
  path: string,
  init: RequestInit,
) => Promise<ApiSuccess<unknown>>;

// A per-transport closure preserves metadata for concurrent requests, including
// null and primitive payloads, without changing the public transport contract.
const envelopeExecutors = new WeakMap<RemoteTransport, EnvelopeExecutor>();

/**
 * Registers the built-in transport's internal access to response envelopes.
 * @param transport - Transport instance that owns the executor.
 * @param executor - Request operation retaining the validated response metadata.
 * @returns Nothing; the association lives only as long as the transport does.
 */
export function registerEnvelopeExecutor(
  transport: RemoteTransport,
  executor: EnvelopeExecutor,
): void {
  envelopeExecutors.set(transport, executor);
}

/**
 * Resolves built-in envelope access without requiring it of custom transports.
 * @param transport - Transport being used by a capability adapter.
 * @returns Its internal executor, or undefined for a custom transport.
 */
export function envelopeExecutorFor(
  transport: RemoteTransport,
): EnvelopeExecutor | undefined {
  return envelopeExecutors.get(transport);
}
