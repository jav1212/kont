import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { Auth } from "../domain/auth";
import { IAuthRepository } from "../domain/repository/auth.repository";

export interface SignUpInput {
    email: string;
    pass: string;
    emailRedirectTo?: string;
}

export class SignUpUseCase extends UseCase<SignUpInput, Auth> {
    constructor(private readonly authRepository: IAuthRepository) {
        super();
    }

    async execute(input: SignUpInput): Promise<Result<Auth>> {
        return await this.authRepository.signUp(input.email, input.pass, input.emailRedirectTo);
    }
}