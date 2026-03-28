// Application layer — reset-password command use case.
// Triggers a password recovery email. Always returns success to avoid email enumeration.
import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { IAuthRepository } from "../domain/repository/auth.repository";

export interface ResetPasswordInput {
    email: string;
    redirectTo?: string;
}

export class ResetPasswordUseCase extends UseCase<ResetPasswordInput, void> {
    constructor(private readonly authRepository: IAuthRepository) {
        super();
    }

    async execute(input: ResetPasswordInput): Promise<Result<void>> {
        if (!input.email?.trim()) {
            return Result.fail('El correo es requerido.');
        }
        return await this.authRepository.resetPassword(input.email.trim(), input.redirectTo);
    }
}
