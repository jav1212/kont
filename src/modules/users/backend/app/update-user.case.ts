import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { IUserRepository } from "../domain/repository/user.repository";
import { User } from "../domain/user";

export interface UpdateUserInput {
    id: string;
    data: Partial<User>;
}

export class UpdateUserUseCase extends UseCase<UpdateUserInput, User> {
    constructor(private readonly userRepository: IUserRepository) {
        super();
    }

    async execute(input: UpdateUserInput): Promise<Result<User>> {
        if (!input.id) return Result.fail("User ID is required for update.");
        return await this.userRepository.update(input.id, input.data);
    }
}