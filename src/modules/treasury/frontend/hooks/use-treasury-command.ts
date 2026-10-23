"use client";

import { useCallback, useRef, useState } from "react";
import type { TreasuryCommandRequest } from "@kontave/client-contracts";
import { useTreasuryContext } from "../context/treasury-context";

export interface TreasuryCommandIdentity {
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

interface PendingOperation {
  readonly operationKey: string;
  readonly identity: TreasuryCommandIdentity;
  readonly resourceId: string;
}

/** Transport failures leave the outcome unknown, so the next attempt must replay the same identity. */
const UNKNOWN_OUTCOME_CODES = new Set(["NETWORK_UNAVAILABLE", "INVALID_RESPONSE", "INTERNAL_ERROR", "TREASURY_UNAVAILABLE"]);

/** Sends commands with a stable retry identity and refreshes affected Treasury views.
 *
 * An operation keeps its idempotency key, correlation and resource identifiers while its outcome is
 * unknown (network, decoding or availability failures), so a retry cannot create a second resource.
 * Success or any definitive domain answer (conflict, validation, permission) discards them; the next
 * attempt rebuilds the payload from refreshed versions under new identifiers.
 *
 * @returns Command execution, pending state, and an explicit operation reset.
 */
export function useTreasuryCommand(): {
  readonly execute: (
    build: (identity: TreasuryCommandIdentity, resourceId: string) => TreasuryCommandRequest,
    operationKey?: string,
  ) => Promise<void>;
  readonly pending: boolean;
  readonly reset: () => void;
} {
  const { command } = useTreasuryContext();
  const operation = useRef<PendingOperation | null>(null);
  const [pending, setPending] = useState(false);
  const reset = useCallback(() => { operation.current = null; }, []);
  /**
   * @param build - Builds the request from the retry identity and the stable identifier of the resource it creates.
   * @param operationKey - Distinguishes unrelated operations sharing this hook, such as actions on different rows.
   * @returns Resolves once the command is committed and dependent views were invalidated.
   * @throws The transport or domain failure returned by the authenticated Treasury API.
   */
  const execute = useCallback(async (
    build: (identity: TreasuryCommandIdentity, resourceId: string) => TreasuryCommandRequest,
    operationKey = "default",
  ) => {
    const current = operation.current?.operationKey === operationKey
      ? operation.current
      : { operationKey, identity: { idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() }, resourceId: crypto.randomUUID() };
    operation.current = current;
    setPending(true);
    try {
      await command(build(current.identity, current.resourceId));
      operation.current = null;
    } catch (cause: unknown) {
      const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : "";
      if (!UNKNOWN_OUTCOME_CODES.has(code)) operation.current = null;
      throw cause;
    } finally {
      setPending(false);
    }
  }, [command]);
  return { execute, pending, reset };
}
