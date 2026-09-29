/**
 * Reports only Client API availability for unauthenticated connectivity checks.
 * @returns An empty successful response with no account, organization, or version data.
 */
export function GET(): Response {
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
