import { withTenant }          from "@/src/shared/backend/utils/require-tenant";
import { handleResult }         from "@/src/shared/backend/utils/handle-result";
import { getReminderActions }   from "@/src/modules/tools/seniat-reminders/backend/infra/reminder-factory";
import { rateLimit }            from "@/src/shared/backend/utils/rate-limit";
import type { ObligationCategory, TaxpayerType } from "@/src/modules/tools/seniat-calendar/data/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withTenant(async (req, { userId }) => {
    // Rate limit per authenticated user — anti email-bomb. Each subscription
    // triggers at most one email per day per RIF, but a malicious caller
    // could create many subs targeting different RIFs/emails. 10/hour is
    // generous for a CPA managing ~dozens of clients.
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
        email?:       string;
        categories?:  ObligationCategory[];
        daysBefore?:  number;
    };

    const { rif, taxpayerType, email, categories = [], daysBefore = 3 } = body;

    // The recipient is the client's email — the authenticated user is the
    // sender (added as Reply-To by the email util). We accept any email but
    // every outgoing message clearly attributes to the user and ships an
    // unsubscribe path, mitigating abuse vectors.
    const trimmedEmail = (email ?? "").trim();
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
        return Response.json({ error: "Correo del destinatario inválido." }, { status: 400 });
    }

    const result = await getReminderActions().subscribe.execute({
        userId,
        email: trimmedEmail,
        rif,
        taxpayerType,
        categories,
        daysBefore,
    });

    return handleResult(result, 201);
});
