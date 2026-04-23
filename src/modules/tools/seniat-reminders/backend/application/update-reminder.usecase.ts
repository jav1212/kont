// =============================================================================
// Application — UpdateReminderUseCase
// Actualiza campos de una suscripción (enabled, categories, daysBefore, email).
// Valida ownership antes de modificar.
// =============================================================================

import { UseCase }   from "@/src/core/domain/use-case";
import { Result }    from "@/src/core/domain/result";
import type { ReminderSubscription, ReminderSubscriptionRepository } from "../domain/reminder-subscription";
import type { ObligationCategory } from "@/src/modules/tools/seniat-calendar/data/types";

interface UpdateReminderInput {
    id:          string;
    userId:      string;
    enabled?:    boolean;
    categories?: ObligationCategory[];
    daysBefore?: number;
    email?:      string;
}

export class UpdateReminderUseCase extends UseCase<UpdateReminderInput, ReminderSubscription> {
    constructor(private readonly repo: ReminderSubscriptionRepository) {
        super();
    }

    async execute({ id, userId, ...patch }: UpdateReminderInput): Promise<Result<ReminderSubscription>> {
        const sub = await this.repo.findById(id);

        if (!sub) {
            return Result.fail("Suscripción no encontrada.");
        }

        if (sub.userId !== userId) {
            return Result.fail("No tienes permiso para modificar esta suscripción.");
        }

        if (patch.daysBefore !== undefined && (patch.daysBefore < 1 || patch.daysBefore > 7)) {
            return Result.fail("Los días de anticipación deben estar entre 1 y 7.");
        }

        if (patch.email !== undefined && (!patch.email || !patch.email.includes("@"))) {
            return Result.fail("El email no es válido.");
        }

        const updated = await this.repo.update(id, patch);
        return Result.success(updated);
    }
}
