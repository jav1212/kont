// Application layer — sign-out command use case.
// Delegates session invalidation to IAuthRepository (port).
import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { IAuthRepository } from "../domain/repository/auth.repository";

export class SignOutUseCase extends UseCase<void, void> {
    constructor(private readonly authRepository: IAuthRepository) {
        super();
    }

    async execute(): Promise<Result<void>> {
        return await this.authRepository.signOut();
    }
}
