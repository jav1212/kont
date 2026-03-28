// Application layer — sign-in command use case.
// Delegates credential validation to IAuthRepository (port).
import { IAuthRepository } from "../domain/repository/auth.repository";
import { Auth } from "../domain/auth";
import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";

export interface SignInInput {
    email: string;
    password: string;
}

export class SignInUseCase extends UseCase<SignInInput, Auth> {
    constructor(private readonly authRepository: IAuthRepository) {
        super();
    }

    async execute(input: SignInInput): Promise<Result<Auth>> {
        return await this.authRepository.signIn(input.email, input.password);
    }
}
