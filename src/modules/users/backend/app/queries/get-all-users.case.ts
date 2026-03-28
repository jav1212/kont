import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { IUserRepository } from "../../domain/repository/user.repository";
import { User } from "../../domain/user";

export class GetAllUsersUseCase extends UseCase<void, User[]> {
    constructor(private readonly userRepository: IUserRepository) {
        super();
    }

    async execute(): Promise<Result<User[]>> {
        return await this.userRepository.findAll();
    }
}