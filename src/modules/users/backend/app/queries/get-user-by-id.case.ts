import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { IUserRepository } from "../../domain/repository/user.repository";
import { User } from "../../domain/user";

export class GetUserByIdUseCase extends UseCase<string, User | null> {
    constructor(private readonly userRepository: IUserRepository) {
        super();
    }

    async execute(id: string): Promise<Result<User | null>> {
        return await this.userRepository.findById(id);
    }
}