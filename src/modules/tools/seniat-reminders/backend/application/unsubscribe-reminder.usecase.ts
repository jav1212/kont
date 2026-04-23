// =============================================================================
// Application — UnsubscribeReminderUseCase
// Elimina una suscripción verificando que pertenezca al usuario.
// =============================================================================

import { UseCase }   from "@/src/core/domain/use-case";
import { Result }    from "@/src/core/domain/result";
import type { ReminderSubscriptionRepository } from "../domain/reminder-subscription";

interface UnsubscribeReminderInput {
    id:     string;
    userId: string; // caller — usado para verificar ownership
}

export class UnsubscribeReminderUseCase extends UseCase<UnsubscribeReminderInput, void> {
    constructor(private readonly repo: ReminderSubscriptionRepository) {
        super();
    }

    async execute({ id, userId }: UnsubscribeReminderInput): Promise<Result<void>> {
        const sub = await this.repo.findById(id);

        if (!sub) {
            return Result.fail("Suscripción no encontrada.");
        }

        if (sub.userId !== userId) {
            return Result.fail("No tienes permiso para eliminar esta suscripción.");
        }

        await this.repo.delete(id);
        return Result.success(undefined);
    }
}
