// =============================================================================
// Application — ListRemindersUseCase
// Lista todas las suscripciones de un usuario.
// =============================================================================

import { UseCase }   from "@/src/core/domain/use-case";
import { Result }    from "@/src/core/domain/result";
import type { ReminderSubscription, ReminderSubscriptionRepository } from "../domain/reminder-subscription";

interface ListRemindersInput {
    userId: string;
}

export class ListRemindersUseCase extends UseCase<ListRemindersInput, ReminderSubscription[]> {
    constructor(private readonly repo: ReminderSubscriptionRepository) {
        super();
    }

    async execute({ userId }: ListRemindersInput): Promise<Result<ReminderSubscription[]>> {
        const subs = await this.repo.findByUserId(userId);
        return Result.success(subs);
    }
}
