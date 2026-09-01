export {
  ClientOperationFailure,
  findClientOperationFailure,
  unwrapClientOperationResult as requireClientValue,
} from "@kontave/client-runtime";

/**
 * Maps an expected remote failure to copy that is safe to cross the Electron boundary.
 * @param code - Stable failure code returned by a client capability.
 * @returns A non-sensitive message suitable for renderer feedback.
 */
export function publicFailureMessage(code: string): string {
  if (code.endsWith("_ACCESS_DENIED")) return "No tienes permisos para completar esta operación.";
  if (code.endsWith("_INVALID") || code === "INVALID_REQUEST") return "La información enviada no es válida.";
  if (code === "SESSION_EXPIRED") return "Tu sesión expiró. Inicia sesión nuevamente.";
  return "No se pudo completar la operación. Intenta nuevamente.";
}
