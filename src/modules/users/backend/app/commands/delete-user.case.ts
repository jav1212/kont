// DeleteUserUseCase — removes a user profile by ID, then emits UserDeleted.
import { Result }             from "@/src/core/domain/result";
import { UseCase }            from "@/src/core/domain/use-case";
import { IEventBus }          from "@/src/core/domain/event-bus";
import { IUserRepository }    from "../../domain/repository/user.repository";
import { UserDeletedPayload } from "../../domain/events/user-deleted.event";

export class DeleteUserUseCase extends UseCase<string, void> {
    constructor(
        private readonly userRepository: IUserRepository,
        private readonly eventBus?: IEventBus,
    ) {
        super();
    }

    async execute(id: string): Promise<Result<void>> {
        if (!id) return Result.fail("User ID is required to delete.");

        const result = await this.userRepository.delete(id);

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<UserDeletedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "user.deleted",
                occurredAt: new Date().toISOString(),
                payload: { userId: id },
            });
        }

        return result;
    }
}
