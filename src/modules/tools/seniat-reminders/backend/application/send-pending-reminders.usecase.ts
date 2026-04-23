// =============================================================================
// Application — SendPendingRemindersUseCase
// Cron diario: busca obligaciones que vencen en `days_before` días y envía
// emails via Resend. Tolerante a fallos individuales (errores aislados, no
// abortan el ciclo completo).
//
// Timezone: America/Caracas (UTC-4 fijo, sin DST).
// =============================================================================

import { UseCase }          from "@/src/core/domain/use-case";
import { Result }           from "@/src/core/domain/result";
import { buildCalendar }    from "@/src/modules/tools/seniat-calendar/utils/calendar-builder";
import { extractLastDigit } from "@/src/modules/tools/seniat-calendar/utils/rif";
import type { ObligationCategory, TaxpayerType } from "@/src/modules/tools/seniat-calendar/data/types";
import type { ReminderSubscriptionRepository } from "../domain/reminder-subscription";
import type { SendPendingRemindersResult }      from "../domain/reminder-events";
import { sendSeniatReminderEmail } from "@/src/shared/backend/utils/send-seniat-reminder-email";

// ── Timezone helpers (America/Caracas = UTC-4, no DST) ────────────────────────

/**
 * Converts any ISO timestamp to a YYYY-MM-DD string in America/Caracas timezone.
 */
function toCaracasDateIso(isoOrDate: string | Date): string {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    // UTC-4 offset: subtract 4 hours
    const caracas = new Date(d.getTime() - 4 * 60 * 60 * 1000);
    const y = caracas.getUTCFullYear();
    const m = String(caracas.getUTCMonth() + 1).padStart(2, "0");
    const day = String(caracas.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/**
 * Adds N calendar days to a YYYY-MM-DD string and returns a new YYYY-MM-DD.
 */
function addDaysVet(isoDate: string, n: number): string {
    const [y, m, d] = isoDate.split("-").map(Number);
    // Use UTC to avoid local timezone shifting
    const date = new Date(Date.UTC(y, m - 1, d + n));
    const yr   = date.getUTCFullYear();
    const mo   = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dy   = String(date.getUTCDate()).padStart(2, "0");
    return `${yr}-${mo}-${dy}`;
}

/**
 * Returns true if two timestamps (or ISO strings) represent the same calendar
 * day in America/Caracas timezone.
 */
function isSameDayVet(a: string | null, b: string): boolean {
    if (!a) return false;
    return toCaracasDateIso(a) === b;
}

// ── Use case ──────────────────────────────────────────────────────────────────

interface SendPendingRemindersInput {
    /** Override "now" for testing purposes. Defaults to new Date().toISOString(). */
    nowIso?: string;
}

export class SendPendingRemindersUseCase extends UseCase<SendPendingRemindersInput, SendPendingRemindersResult> {
    constructor(private readonly repo: ReminderSubscriptionRepository) {
        super();
    }

    async execute({ nowIso }: SendPendingRemindersInput): Promise<Result<SendPendingRemindersResult>> {
        const now        = nowIso ?? new Date().toISOString();
        const todayVet   = toCaracasDateIso(now);
        const currentYear = parseInt(todayVet.slice(0, 4), 10);

        const subs = await this.repo.findEnabled();

        let processed = 0;
        let sent      = 0;
        let skipped   = 0;
        const errors: Array<{ id: string; error: string }> = [];

        for (const sub of subs) {
            processed++;

            try {
                // Skip if we already sent today (Caracas time)
                if (isSameDayVet(sub.lastSentAt, todayVet)) {
                    skipped++;
                    continue;
                }

                const lastDigit = extractLastDigit(sub.rif);
                if (lastDigit == null) {
                    skipped++;
                    continue;
                }

                const entries = buildCalendar({
                    year:           currentYear,
                    lastDigit,
                    taxpayerType:   sub.taxpayerType as TaxpayerType,
                    categoryFilter: sub.categories.length > 0
                        ? sub.categories as ObligationCategory[]
                        : undefined,
                });

                // Find obligations whose dueDate is exactly daysBefore days from today
                const targetDate = addDaysVet(todayVet, sub.daysBefore);
                const matching   = entries.filter((e) => e.dueDate === targetDate);

                if (matching.length === 0) {
                    skipped++;
                    continue;
                }

                await sendSeniatReminderEmail({
                    to:           sub.email,
                    rif:          sub.rif,
                    taxpayerType: sub.taxpayerType as "ordinario" | "especial",
                    daysBefore:   sub.daysBefore,
                    obligations:  matching,
                });

                await this.repo.updateLastSent(sub.id, now);
                sent++;
            } catch (err) {
                // Log the error but continue with remaining subscriptions
                errors.push({ id: sub.id, error: (err as Error).message ?? String(err) });
            }
        }

        return Result.success({ processed, sent, skipped, errors });
    }
}
