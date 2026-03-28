// Application layer — validates and updates a user profile, then emits UserUpdated.
import { Result }             from "@/src/core/domain/result";
import { UseCase }            from "@/src/core/domain/use-case";
import { IEventBus }          from "@/src/core/domain/event-bus";
import { IUserRepository }    from "../../domain/repository/user.repository";
import { User }               from "../../domain/user";
import { UserUpdatedPayload } from "../../domain/events/user-updated.event";

export interface UpdateUserInput {
    id:   string;
    data: Partial<User>;
}

export class UpdateUserUseCase extends UseCase<UpdateUserInput, User> {
    constructor(
        private readonly userRepository: IUserRepository,
        private readonly eventBus?: IEventBus,
    ) {
        super();
    }

    async execute(input: UpdateUserInput): Promise<Result<User>> {
        if (!input.id) return Result.fail("User ID is required for update.");

        const result = await this.userRepository.update(input.id, input.data);

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<UserUpdatedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "user.updated",
                occurredAt: new Date().toISOString(),
                payload: {
                    userId:        input.id,
                    updatedFields: Object.keys(input.data),
                },
            });
        }

        return result;
    }
}
