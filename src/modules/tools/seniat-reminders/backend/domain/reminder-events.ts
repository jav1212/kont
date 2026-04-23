// =============================================================================
// Domain — Reminder Events
// Tipos auxiliares usados en el cron y en el template de email.
// =============================================================================

import type { CalendarEntry } from "@/src/modules/tools/seniat-calendar/data/types";

/** Resultado de un ciclo de envío del cron */
export interface SendPendingRemindersResult {
    processed: number;
    sent:      number;
    skipped:   number;
    errors:    Array<{ id: string; error: string }>;
}

/** Payload para enviar un email de recordatorio vía Resend */
export interface SendReminderEmailOptions {
    to:           string;
    rif:          string;
    taxpayerType: "ordinario" | "especial";
    daysBefore:   number;
    obligations:  CalendarEntry[];
}
