/** The authenticated shell route available before organization permissions load. */
export const DEFAULT_POST_AUTHENTICATION_DESTINATION = "/tools";

/**
 * Chooses where an authenticated user goes after completing an authentication
 * flow. A caller-provided return URL remains intact so the destination route
 * can apply its own authorization policy.
 *
 * @param redirect - Explicit return URL from the established `redirect` query parameter.
 * @param redirectTo - Explicit return URL from the legacy `redirectTo` query parameter.
 * @returns The requested return URL, or the session-only tools route by default.
 * @throws Never throws expected errors.
 */
export function resolvePostAuthenticationDestination(
  redirect: string | null,
  redirectTo: string | null,
): string {
  return redirect ?? redirectTo ?? DEFAULT_POST_AUTHENTICATION_DESTINATION;
}
