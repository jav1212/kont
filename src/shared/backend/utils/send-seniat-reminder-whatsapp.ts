// =============================================================================
// Shared — sendSeniatReminderWhatsApp
// Recordatorio tributario SENIAT vía WhatsApp Cloud API (Meta Graph v20).
//
// Plantilla requerida (debe estar APROBADA en Meta Business Manager antes de
// usar este endpoint en producción):
//
//   Nombre:    seniat_reminder
//   Idioma:    es
//   Categoría: UTILITY
//   Body:
//     Hola, {{1}} te recuerda que tienes obligaciones SENIAT por vencer en
//     {{2}} para el RIF {{3}}:
//
//     {{4}}
//
//     Ver calendario: kontave.com/herramientas/calendario-seniat
//
// Parámetros:
//   {{1}} = sender (nombre del CPA o "Konta")
//   {{2}} = días label ("3 días", "1 día")
//   {{3}} = RIF
//   {{4}} = lista de obligaciones (multi-línea)
//
// Variables de entorno:
//   WHATSAPP_API_KEY          — access token permanente del system user.
//   WHATSAPP_PHONE_NUMBER_ID  — id del número remitente (Meta Business Manager).
//   WHATSAPP_TEMPLATE_NAME    — (opcional) override del nombre del template.
//                               Default: "seniat_reminder".
//   WHATSAPP_TEMPLATE_LANG    — (opcional) override del language code.
//                               Default: "es". Otros valores comunes: "es_VE",
//                               "es_ES", "es_MX", "es_LA" — Meta exige el código
//                               exacto con el que se aprobó el template.
// =============================================================================

import type { CalendarEntry } from "@/src/modules/tools/seniat-calendar/data/types";

export interface SendSeniatReminderWhatsAppOptions {
    /** Teléfono del destinatario en E.164 (ej. +584141234567). */
    to:           string;
    rif:          string;
    taxpayerType: "ordinario" | "especial";
    daysBefore:   number;
    obligations:  CalendarEntry[];
    /** Display name del usuario que activó el recordatorio ("OficinaKm11"). */
    senderName?:  string;
}

const DEFAULT_TEMPLATE_NAME = "seniat_reminder";
const DEFAULT_TEMPLATE_LANG = "es";
const GRAPH_API_VERSION     = "v20.0";
// Meta limita cada parámetro de body a 1024 chars.
const PARAM_MAX_CHARS   = 1024;

const MONTHS = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatDate(iso: string): string {
    const [, m, d] = iso.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}`;
}

/** Quita +, espacios, guiones y paréntesis. Meta acepta solo dígitos en `to`. */
function normalizeForMeta(phone: string): string {
    return phone.replace(/[^0-9]/g, "");
}

/** Trunca un string respetando el límite de Meta y agregando elipsis si recorta. */
function clamp(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + "…";
}

export async function sendSeniatReminderWhatsApp(opts: SendSeniatReminderWhatsAppOptions): Promise<void> {
    const apiKey        = process.env.WHATSAPP_API_KEY;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName  = process.env.WHATSAPP_TEMPLATE_NAME?.trim() || DEFAULT_TEMPLATE_NAME;
    const templateLang  = process.env.WHATSAPP_TEMPLATE_LANG?.trim() || DEFAULT_TEMPLATE_LANG;

    if (!apiKey || !phoneNumberId) {
        throw new Error("WhatsApp env vars missing (WHATSAPP_API_KEY / WHATSAPP_PHONE_NUMBER_ID).");
    }

    const { to, rif, daysBefore, obligations, senderName } = opts;
    const sender    = senderName?.trim() || "Konta";
    const daysLabel = daysBefore === 1 ? "1 día" : `${daysBefore} días`;

    // Lista compacta para WhatsApp. Meta NO permite \n, \t ni 4+ espacios
    // consecutivos dentro de valores de parámetros (cuerpo estático del
    // template sí los conserva — sólo aplica al valor sustituido).
    const obligationsList = clamp(
        obligations
            .map((ob) => `• ${ob.shortTitle} (vence ${formatDate(ob.dueDate)})`)
            .join(" · "),
        PARAM_MAX_CHARS,
    );

    const body = {
        messaging_product: "whatsapp",
        to:                normalizeForMeta(to),
        type:              "template",
        template: {
            name:     templateName,
            language: { code: templateLang },
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: clamp(sender,         PARAM_MAX_CHARS) },
                        { type: "text", text: clamp(daysLabel,      PARAM_MAX_CHARS) },
                        { type: "text", text: clamp(rif,            PARAM_MAX_CHARS) },
                        { type: "text", text: obligationsList },
                    ],
                },
            ],
        },
    };

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

    const res = await fetch(url, {
        method:  "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type":  "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`;
        try {
            const json = await res.json() as {
                error?: {
                    message?:    string;
                    code?:       number;
                    error_data?: { details?: string };
                };
            };
            if (json.error?.message) {
                const code    = json.error.code ?? res.status;
                const details = json.error.error_data?.details;
                detail = details
                    ? `${code}: ${json.error.message} — ${details}`
                    : `${code}: ${json.error.message}`;
            }
        } catch {
            // body no JSON — usa status text
        }
        throw new Error(`WhatsApp API: ${detail}`);
    }

    // Diagnóstico: Meta puede devolver 200 sin entregar. Si `contacts[0].wa_id`
    // viene vacío => destinatario no tiene WhatsApp. Si la cuenta está en modo
    // desarrollo y el `to` no es un test recipient, igual responde 200. El
    // wamid + wa_id quedan en los logs (`vercel logs`) para auditar entregas.
    try {
        const json = await res.json() as {
            contacts?: Array<{ wa_id?: string; input?: string }>;
            messages?: Array<{ id?: string; message_status?: string }>;
        };
        const wamid = json.messages?.[0]?.id     ?? "<sin-wamid>";
        const waId  = json.contacts?.[0]?.wa_id  ?? "<sin-wa_id>";
        const to    = normalizeForMeta(opts.to);
        // eslint-disable-next-line no-console
        console.log(`[whatsapp] sent to=${to} wa_id=${waId} wamid=${wamid}`);
        if (!json.contacts?.[0]?.wa_id) {
            throw new Error(
                `WhatsApp API: Meta aceptó la request pero el destinatario ${to} no tiene WhatsApp registrado (wa_id vacío).`,
            );
        }
    } catch (err) {
        if (err instanceof Error && err.message.startsWith("WhatsApp API:")) {
            throw err;
        }
        // Si parsear el body falla, no rompemos — Meta ya devolvió 200.
    }
}
