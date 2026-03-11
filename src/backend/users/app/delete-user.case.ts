import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { IUserRepository } from "../domain/repository/user.repository";

export class DeleteUserUseCase extends UseCase<string, void> {
    constructor(private readonly userRepository: IUserRepository) {
        super();
    }

    async execute(id: string): Promise<Result<void>> {
        if (!id) return Result.fail("User ID is required to delete.");
        return await this.userRepository.delete(id);
    }
}