import { withTenant }        from "@/src/shared/backend/utils/require-tenant";
import { handleResult }       from "@/src/shared/backend/utils/handle-result";
import { getReminderActions } from "@/src/modules/tools/seniat-reminders/backend/infra/reminder-factory";
import type { ObligationCategory } from "@/src/modules/tools/seniat-calendar/data/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

function normalizePhone(raw: string): string {
    const cleaned = raw.replace(/[\s\-()]/g, "");
    if (!cleaned) return "";
    return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

export const PATCH = withTenant(async (req, { userId }) => {
    const body = await req.json() as {
        id:          string;
        enabled?:    boolean;
        categories?: ObligationCategory[];
        daysBefore?: number;
        email?:      string | null;
        phone?:      string | null;
    };

    const { id, enabled, categories, daysBefore, email, phone } = body;

    if (!id) {
        return Response.json({ error: "El campo 'id' es requerido." }, { status: 400 });
    }

    // Normalizar/validar canales si vienen en el patch.
    // Convención: string vacío o null => borrar el canal; ausente => no tocar.
    let nextEmail: string | null | undefined;
    if (email === undefined) {
        nextEmail = undefined;
    } else if (email === null || email.trim() === "") {
        nextEmail = null;
    } else {
        const trimmed = email.trim();
        if (!EMAIL_RE.test(trimmed)) {
            return Response.json({ error: "Correo del destinatario inválido." }, { status: 400 });
        }
        nextEmail = trimmed;
    }

    let nextPhone: string | null | undefined;
    if (phone === undefined) {
        nextPhone = undefined;
    } else if (phone === null || phone.trim() === "") {
        nextPhone = null;
    } else {
        const normalized = normalizePhone(phone);
        if (!PHONE_RE.test(normalized)) {
            return Response.json({ error: "Número de WhatsApp inválido (formato +584141234567)." }, { status: 400 });
        }
        nextPhone = normalized;
    }

    const result = await getReminderActions().update.execute({
        id, userId, enabled, categories, daysBefore,
        email: nextEmail,
        phone: nextPhone,
    });
    return handleResult(result);
});
