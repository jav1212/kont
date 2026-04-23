// =============================================================================
// Cron — /api/cron/seniat-reminders
// Disparado diariamente a las 12:00 UTC (08:00 America/Caracas) por Vercel.
//
// Variables de entorno requeridas en Vercel:
//   CRON_SECRET            — secreto compartido que protege este endpoint.
//                            Vercel lo envía automáticamente como header
//                            "Authorization: Bearer $CRON_SECRET" en cada ejecución.
//   SUPABASE_SERVICE_ROLE_KEY — key de service_role para bypass de RLS.
//   RESEND_API_KEY           — API key de Resend para envío de emails.
//   RESEND_FROM_EMAIL        — dirección remitente (ej: konta <no-reply@kontave.com>).
//
// Para probar manualmente desde local o staging:
//   curl -X GET http://localhost:3000/api/cron/seniat-reminders \
//     -H "Authorization: Bearer TU_CRON_SECRET"
//
// El endpoint es idempotente: la tabla guarda `last_sent_at` y el cron
// no re-envía emails en el mismo día (America/Caracas).
// =============================================================================

import { getSystemReminderActions } from "@/src/modules/tools/seniat-reminders/backend/infra/reminder-factory";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    // ── Auth: validate CRON_SECRET header ─────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        // Return 401 silently — no logging to avoid leaking endpoint existence.
        return new Response("Unauthorized", { status: 401 });
    }

    // ── Allow optional ?now= param for manual testing with a specific date ─────
    const { searchParams } = new URL(request.url);
    const nowIso = searchParams.get("now") ?? undefined;

    try {
        const { sendPending } = getSystemReminderActions();
        const result = await sendPending.execute({ nowIso });

        if (result.isFailure) {
            return Response.json({ error: result.getError() }, { status: 500 });
        }

        const summary = result.getValue();
        console.log("[cron/seniat-reminders]", summary);

        return Response.json({ ok: true, ...summary });
    } catch (err) {
        const msg = (err as Error).message ?? String(err);
        console.error("[cron/seniat-reminders] Fatal error:", msg);
        return Response.json({ error: msg }, { status: 500 });
    }
}
