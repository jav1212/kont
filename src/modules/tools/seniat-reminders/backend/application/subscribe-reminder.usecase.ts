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
    email:        string;
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
        const { userId, email, rif, taxpayerType, categories, daysBefore = 3 } = input;

        // Validate RIF format
        if (!validateRif(rif)) {
            return Result.fail("El RIF ingresado no tiene un formato válido (ej: J-12345678-9).");
        }

        // Validate days_before range
        if (daysBefore < 1 || daysBefore > 7) {
            return Result.fail("Los días de anticipación deben estar entre 1 y 7.");
        }

        // Validate email
        if (!email || !email.includes("@")) {
            return Result.fail("El email no es válido.");
        }

        try {
            const sub = await this.repo.create({
                userId,
                email,
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
