import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { IUserRepository } from "../domain/repository/user.repository";
import { User } from "../domain/user";

export class GetUserByEmailUseCase extends UseCase<string, User | null> {
    constructor(private readonly userRepository: IUserRepository) {
        super();
    }

    async execute(email: string): Promise<Result<User | null>> {
        if (!email.includes('@')) return Result.fail("Invalid email format.");
        return await this.userRepository.findByEmail(email);
    }
}