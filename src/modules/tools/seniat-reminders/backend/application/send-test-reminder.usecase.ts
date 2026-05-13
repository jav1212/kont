// =============================================================================
// Application — SendTestReminderUseCase
// Envío manual ("Enviar ahora") usado desde el panel de recordatorios para
// que el contador pueda probar que sus canales (email/WhatsApp) están bien
// configurados sin esperar al cron.
//
// Diferencias con SendPendingRemindersUseCase:
//   - Ignora el filtro `daysBefore` y elige las próximas obligaciones que
//     calzan con el RIF/taxpayerType/categories de la sub.
//   - Ignora `last_sent_at` (NO lo actualiza) — el cron sigue siendo dueño
//     del envío real del día.
//   - Funciona aunque la sub esté `enabled = false` (sigue siendo de su dueño).
//   - Verifica ownership con userId.
// =============================================================================

import { UseCase }          from "@/src/core/domain/use-case";
import { Result }           from "@/src/core/domain/result";
import { buildCalendar }    from "@/src/modules/tools/seniat-calendar/utils/calendar-builder";
import { extractLastDigit } from "@/src/modules/tools/seniat-calendar/utils/rif";
import type { ObligationCategory, TaxpayerType } from "@/src/modules/tools/seniat-calendar/data/types";
import type { ReminderSubscriptionRepository }   from "../domain/reminder-subscription";
import { sendSeniatReminderEmail }    from "@/src/shared/backend/utils/send-seniat-reminder-email";
import { sendSeniatReminderWhatsApp } from "@/src/shared/backend/utils/send-seniat-reminder-whatsapp";

const MAX_TEST_OBLIGATIONS = 5;

interface SendTestReminderInput {
    id:     string;
    userId: string;
}

export type TestChannelResult =
    | { channel: "email";    ok: true }
    | { channel: "email";    ok: false; error: string }
    | { channel: "whatsapp"; ok: true }
    | { channel: "whatsapp"; ok: false; error: string };

export interface SendTestReminderResult {
    channels:         TestChannelResult[];
    obligationsCount: number;
}

/**
 * Caracas-local YYYY-MM-DD para el "hoy" usado al filtrar próximas obligaciones.
 */
function todayCaracasIso(): string {
    const now     = new Date();
    const caracas = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const y = caracas.getUTCFullYear();
    const m = String(caracas.getUTCMonth() + 1).padStart(2, "0");
    const d = String(caracas.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export class SendTestReminderUseCase extends UseCase<SendTestReminderInput, SendTestReminderResult> {
    constructor(private readonly repo: ReminderSubscriptionRepository) {
        super();
    }

    async execute({ id, userId }: SendTestReminderInput): Promise<Result<SendTestReminderResult>> {
        const sub = await this.repo.findById(id);

        if (!sub) {
            return Result.fail("Suscripción no encontrada.");
        }

        if (sub.userId !== userId) {
            return Result.fail("No tienes permiso para enviar esta prueba.");
        }

        if (!sub.email && !sub.phone) {
            return Result.fail("La suscripción no tiene canales configurados.");
        }

        const lastDigit = extractLastDigit(sub.rif);
        if (lastDigit == null) {
            return Result.fail("RIF inválido — no se pudo determinar el dígito verificador.");
        }

        const today        = todayCaracasIso();
        const currentYear  = parseInt(today.slice(0, 4), 10);

        const allEntries = buildCalendar({
            year:           currentYear,
            lastDigit,
            taxpayerType:   sub.taxpayerType as TaxpayerType,
            categoryFilter: sub.categories.length > 0
                ? sub.categories as ObligationCategory[]
                : undefined,
        });

        const upcoming = allEntries
            .filter((e) => e.dueDate >= today)
            .slice(0, MAX_TEST_OBLIGATIONS);

        // Fallback: si el año está agotado de obligaciones futuras, usa las
        // últimas del año actual para que el mensaje no quede vacío.
        const obligations = upcoming.length > 0
            ? upcoming
            : allEntries.slice(-MAX_TEST_OBLIGATIONS);

        if (obligations.length === 0) {
            return Result.fail("No hay obligaciones aplicables a este RIF para enviar una prueba.");
        }

        const meta        = await this.repo.findUserMeta(sub.userId);
        const senderName  = meta?.name?.trim() || meta?.email?.split("@")[0] || undefined;
        const senderEmail = meta?.email;

        const results: TestChannelResult[] = [];

        if (sub.phone) {
            try {
                await sendSeniatReminderWhatsApp({
                    to:           sub.phone,
                    rif:          sub.rif,
                    taxpayerType: sub.taxpayerType as "ordinario" | "especial",
                    daysBefore:   sub.daysBefore,
                    obligations,
                    senderName,
                });
                results.push({ channel: "whatsapp", ok: true });
            } catch (err) {
                results.push({
                    channel: "whatsapp",
                    ok:      false,
                    error:   (err as Error).message ?? String(err),
                });
            }
        }

        if (sub.email) {
            try {
                await sendSeniatReminderEmail({
                    to:           sub.email,
                    rif:          sub.rif,
                    taxpayerType: sub.taxpayerType as "ordinario" | "especial",
                    daysBefore:   sub.daysBefore,
                    obligations,
                    senderName,
                    senderEmail,
                });
                results.push({ channel: "email", ok: true });
            } catch (err) {
                results.push({
                    channel: "email",
                    ok:      false,
                    error:   (err as Error).message ?? String(err),
                });
            }
        }

        return Result.success({
            channels:         results,
            obligationsCount: obligations.length,
        });
    }
}
