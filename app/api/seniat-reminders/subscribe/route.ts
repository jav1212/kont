import { withTenant }          from "@/src/shared/backend/utils/require-tenant";
import { handleResult }         from "@/src/shared/backend/utils/handle-result";
import { getReminderActions }   from "@/src/modules/tools/seniat-reminders/backend/infra/reminder-factory";
import { rateLimit }            from "@/src/shared/backend/utils/rate-limit";
import type { ObligationCategory, TaxpayerType } from "@/src/modules/tools/seniat-calendar/data/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164: + seguido de 1-9 inicial y 7-14 dígitos más (8-15 dígitos en total).
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

/** Quita espacios, guiones, paréntesis. Asegura prefijo `+` si vienen solo dígitos. */
function normalizePhone(raw: string): string {
    const cleaned = raw.replace(/[\s\-()]/g, "");
    if (!cleaned) return "";
    return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

export const POST = withTenant(async (req, { userId }) => {
    // Rate limit per authenticated user — anti spam-bomb. Cada suscripción
    // dispara como mucho un mensaje por día por RIF, pero un caller malicioso
    // podría crear muchas subs apuntando a distintos números/correos.
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
        phone?:       string;
        categories?:  ObligationCategory[];
        daysBefore?:  number;
    };

    const { rif, taxpayerType, email, phone, categories = [], daysBefore = 3 } = body;

    // Email opcional, pero si viene debe ser válido. El destinatario es el
    // correo del cliente — el usuario autenticado es el firmante (Reply-To).
    const trimmedEmail = (email ?? "").trim();
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
        return Response.json({ error: "Correo del destinatario inválido." }, { status: 400 });
    }

    // WhatsApp opcional, pero si viene debe normalizarse a E.164.
    const normalizedPhone = phone ? normalizePhone(phone) : "";
    if (normalizedPhone && !PHONE_RE.test(normalizedPhone)) {
        return Response.json({ error: "Número de WhatsApp inválido (formato +584141234567)." }, { status: 400 });
    }

    if (!trimmedEmail && !normalizedPhone) {
        return Response.json({ error: "Debes indicar al menos un correo o un número de WhatsApp." }, { status: 400 });
    }

    const result = await getReminderActions().subscribe.execute({
        userId,
        email:        trimmedEmail || null,
        phone:        normalizedPhone || null,
        rif,
        taxpayerType,
        categories,
        daysBefore,
    });

    return handleResult(result, 201);
});
