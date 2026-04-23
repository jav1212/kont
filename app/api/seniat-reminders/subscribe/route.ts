import { withTenant }          from "@/src/shared/backend/utils/require-tenant";
import { handleResult }         from "@/src/shared/backend/utils/handle-result";
import { getReminderActions }   from "@/src/modules/tools/seniat-reminders/backend/infra/reminder-factory";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { rateLimit }            from "@/src/shared/backend/utils/rate-limit";
import type { ObligationCategory, TaxpayerType } from "@/src/modules/tools/seniat-calendar/data/types";

export const POST = withTenant(async (req, { userId }) => {
    // Cuota por usuario — previene que una cuenta comprometida genere
    // suscripciones masivas (aunque el email ya está fijado al user autenticado).
    const denied = await rateLimit(req, {
        bucket:    "seniat-subscribe",
        limit:     10,
        windowSec: 3600,
        keyExtra:  userId,
    });
    if (denied) return denied;

    const body = await req.json() as {
        rif:          string;
        taxpayerType: TaxpayerType;
        categories?:  ObligationCategory[];
        daysBefore?:  number;
    };

    const { rif, taxpayerType, categories = [], daysBefore = 3 } = body;

    // El email se resuelve SIEMPRE desde el usuario autenticado para impedir
    // que un cliente suscriba direcciones arbitrarias (email-bomb vector).
    const source = new ServerSupabaseSource();
    const { data: userData } = await source.instance.auth.admin.getUserById(userId);
    const email = userData.user?.email ?? "";

    if (!email) {
        return Response.json({ error: "No se pudo determinar el email del usuario." }, { status: 400 });
    }

    const result = await getReminderActions().subscribe.execute({
        userId,
        email,
        rif,
        taxpayerType,
        categories,
        daysBefore,
    });

    return handleResult(result, 201);
});
