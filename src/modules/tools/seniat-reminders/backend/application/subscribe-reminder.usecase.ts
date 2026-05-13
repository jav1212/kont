// =============================================================================
// Application — SubscribeReminderUseCase
// Crea una nueva suscripción a recordatorios para un RIF dado.
// =============================================================================

import { UseCase }   from "@/src/core/domain/use-case";
import { Result }    from "@/src/core/domain/result";
import type { ReminderSubscription, ReminderSubscriptionRepository } from "../domain/reminder-subscription";
import type { ObligationCategory, TaxpayerType } from "@/src/modules/tools/seniat-calendar/data/types";
import { validateRif } from "@/src/modules/tools/seniat-calendar/utils/rif";

interface SubscribeReminderInput {
    userId:       string;
    /** Correo del cliente. Null/omitido si la suscripción es solo WhatsApp. */
    email:        string | null;
    /** WhatsApp del cliente en E.164. Null/omitido si la suscripción es solo email. */
    phone:        string | null;
    rif:          string;
    taxpayerType: TaxpayerType;
    categories:   ObligationCategory[];
    daysBefore?:  number;
}

export class SubscribeReminderUseCase extends UseCase<SubscribeReminderInput, ReminderSubscription> {
    constructor(private readonly repo: ReminderSubscriptionRepository) {
        super();
    }

    async execute(input: SubscribeReminderInput): Promise<Result<ReminderSubscription>> {
        const { userId, email, phone, rif, taxpayerType, categories, daysBefore = 3 } = input;

        // Validate RIF format
        if (!validateRif(rif)) {
            return Result.fail("El RIF ingresado no tiene un formato válido (ej: J-12345678-9).");
        }

        // Validate days_before range
        if (daysBefore < 1 || daysBefore > 7) {
            return Result.fail("Los días de anticipación deben estar entre 1 y 7.");
        }

        // Al menos un canal debe estar presente.
        if (!email && !phone) {
            return Result.fail("Debes indicar al menos un correo o un número de WhatsApp.");
        }

        if (email && !email.includes("@")) {
            return Result.fail("El email no es válido.");
        }

        try {
            const sub = await this.repo.create({
                userId,
                email,
                phone,
                rif,
                taxpayerType,
                categories,
                daysBefore,
                enabled: true,
            });
            return Result.success(sub);
        } catch (err) {
            const msg = (err as Error).message ?? "";
            // Unique constraint violation from Supabase/Postgres
            if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
                return Result.fail("Ya tienes un recordatorio activo para ese RIF y tipo de contribuyente.");
            }
            return Result.fail(`Error al crear la suscripción: ${msg}`);
        }
    }
}
