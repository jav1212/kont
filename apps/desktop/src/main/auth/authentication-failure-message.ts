/**
 * Maps an authentication failure code to stable renderer feedback.
 *
 * This adapter intentionally never receives an error instance: remote messages
 * may include operational or credential-adjacent diagnostics and must not cross IPC.
 * @param code - Stable failure code exposed by the authentication domain.
 * @returns Localized, non-sensitive feedback appropriate for the renderer.
 */
export function authenticationFailureMessage(code: string): string {
  if (code === "INVALID_INPUT") return "Verifica la información ingresada.";
  if (code === "INVALID_CREDENTIALS") return "Las credenciales no son válidas.";
  if (code === "SESSION_EXPIRED") return "Tu sesión expiró. Inicia sesión nuevamente.";
  return "No se pudo completar la autenticación. Intenta nuevamente.";
}
