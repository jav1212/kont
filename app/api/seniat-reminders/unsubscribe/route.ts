import { withTenant }        from "@/src/shared/backend/utils/require-tenant";
import { handleResult }       from "@/src/shared/backend/utils/handle-result";
import { getReminderActions } from "@/src/modules/tools/seniat-reminders/backend/infra/reminder-factory";

export const POST = withTenant(async (req, { userId }) => {
    const { id } = await req.json() as { id: string };

    if (!id) {
        return Response.json({ error: "El campo 'id' es requerido." }, { status: 400 });
    }

    const result = await getReminderActions().unsubscribe.execute({ id, userId });
    return handleResult(result);
});
