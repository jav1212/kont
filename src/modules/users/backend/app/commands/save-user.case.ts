// SaveUserUseCase — validates and persists a new user profile, then emits UserSaved.
import { UseCase }          from "@/src/core/domain/use-case";
import { Result }           from "@/src/core/domain/result";
import { IEventBus }        from "@/src/core/domain/event-bus";
import { IUserRepository }  from "../../domain/repository/user.repository";
import { User }             from "../../domain/user";
import { UserSavedPayload } from "../../domain/events/user-saved.event";

export class SaveUserUseCase extends UseCase<User, void> {
    constructor(
        private readonly userRepository: IUserRepository,
        private readonly eventBus?: IEventBus,
    ) {
        super();
    }

    async execute(user: User): Promise<Result<void>> {
        if (!user.id || !user.email) {
            return Result.fail("User ID and Email are required to save.");
        }

        const result = await this.userRepository.save(user);

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<UserSavedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "user.saved",
                occurredAt: new Date().toISOString(),
                payload: { userId: user.id, email: user.email },
            });
        }

        return result;
    }
}
