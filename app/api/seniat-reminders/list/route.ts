import { withTenant }        from "@/src/shared/backend/utils/require-tenant";
import { handleResult }       from "@/src/shared/backend/utils/handle-result";
import { getReminderActions } from "@/src/modules/tools/seniat-reminders/backend/infra/reminder-factory";

export const GET = withTenant(async (_req, { userId }) => {
    const result = await getReminderActions().list.execute({ userId });
    return handleResult(result);
});
