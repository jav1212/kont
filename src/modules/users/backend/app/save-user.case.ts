import { UseCase } from "@/src/core/domain/use-case";
import { IUserRepository } from "../domain/repository/user.repository";
import { User } from "../domain/user";
import { Result } from "@/src/core/domain/result";

export class SaveUserUseCase extends UseCase<User, void> {
    constructor(private readonly userRepository: IUserRepository) {
        super();
    }

    async execute(user: User): Promise<Result<void>> {
        if (!user.id || !user.email) {
            return Result.fail("User ID and Email are required to save.");
        }
        return await this.userRepository.save(user);
    }
}