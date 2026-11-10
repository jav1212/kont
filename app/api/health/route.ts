export const dynamic = "force-dynamic";

/**
 * Liveness probe for the hosting platform. Touches no external service, so a
 * Supabase outage does not make the platform restart the container.
 * @returns A 200 JSON response while the server process can handle requests.
 */
export function GET() {
    return Response.json({ ok: true });
}
