import { withTenant }        from "@/src/shared/backend/utils/require-tenant";
import { handleResult }       from "@/src/shared/backend/utils/handle-result";
import { getReminderActions } from "@/src/modules/tools/seniat-reminders/backend/infra/reminder-factory";
import type { ObligationCategory } from "@/src/modules/tools/seniat-calendar/data/types";

export const PATCH = withTenant(async (req, { userId }) => {
    const body = await req.json() as {
        id:          string;
        enabled?:    boolean;
        categories?: ObligationCategory[];
        daysBefore?: number;
    };

    const { id, enabled, categories, daysBefore } = body;

    if (!id) {
        return Response.json({ error: "El campo 'id' es requerido." }, { status: 400 });
    }

    // El email NO se acepta en el patch: se liga al usuario autenticado
    // al momento de crear la suscripción y no puede reasignarse arbitrariamente
    // (evita email-bomb vector vía /update).
    const result = await getReminderActions().update.execute({
        id, userId, enabled, categories, daysBefore,
    });
    return handleResult(result);
});
