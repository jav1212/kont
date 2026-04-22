import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { IAuthRepository } from "../domain/repository/auth.repository";

export interface ResendConfirmationInput {
    email: string;
    emailRedirectTo?: string;
}

export class ResendConfirmationUseCase extends UseCase<ResendConfirmationInput, void> {
    constructor(private readonly authRepository: IAuthRepository) {
        super();
    }

    async execute(input: ResendConfirmationInput): Promise<Result<void>> {
        const email = input.email?.trim();
        if (!email)                         return Result.fail("El correo es requerido.");
        if (!/\S+@\S+\.\S+/.test(email))   return Result.fail("El correo no es válido.");

        return await this.authRepository.resendConfirmation(email, input.emailRedirectTo);
    }
}
