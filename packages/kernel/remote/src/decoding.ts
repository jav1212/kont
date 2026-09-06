import { KontaveRemoteFailure, type RemoteTransport } from "./transport";
import { envelopeExecutorFor } from "./transport/response-envelope";

/** Runtime decoder primitives for data received from the Client API. */
export type Decoder<T> = (value: unknown) => T | null;

/**
 * Decodes a transport response before it crosses a feature port.
 * @param response - Promise returned by a protocol-neutral transport.
 * @param decoder - DTO-specific decoder owned by the feature adapter.
 * @returns The decoded DTO.
 * @throws KontaveRemoteFailure when the server payload does not satisfy the feature contract.
 */
export async function decode<T>(
  response: Promise<unknown>,
  decoder: Decoder<T>,
): Promise<T> {
  const value = decoder(await response);
  if (value !== null) return value;
  throw new KontaveRemoteFailure(
    "INVALID_RESPONSE",
    "Kontave devolvió datos no válidos.",
  );
}

/**
 * Validates a capability response, retaining correlation for the built-in transport.
 * @param transport - Built-in or injected transport; custom results are also validated.
 * @param path - Capability-owned relative API path.
 * @param init - Request method, headers and payload.
 * @param decoder - Validator for the capability's complete response DTO.
 * @returns The validated response without dropping additional server fields.
 * @throws {KontaveRemoteFailure} On invalid data, protocol or transport failure.
 */
export async function decodeRemote<T>(
  transport: RemoteTransport,
  path: string,
  init: RequestInit,
  decoder: Decoder<T>,
): Promise<T> {
  const executor = envelopeExecutorFor(transport);
  if (!executor) {
    return decode(
      init.method === "GET"
        ? transport.get(path)
        : transport.request(path, init),
      decoder,
    );
  }
  const envelope = await executor(path, init);
  const value = decoder(envelope.data);
  if (value !== null) return value;
  throw new KontaveRemoteFailure(
    "INVALID_RESPONSE",
    "Kontave devolvió datos no válidos.",
    envelope.meta.requestId,
  );
}

/**
 * Validates an array and every member without coercion.
 * @param value - Candidate array.
 * @param decoder - Member decoder.
 * @returns Decoded array, or null when any member is invalid.
 */
export function array<T>(
  value: unknown,
  decoder: Decoder<T>,
): readonly T[] | null {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (const item of value) {
    const decoded = decoder(item);
    if (decoded === null) return null;
    items.push(decoded);
  }
  return items;
}
