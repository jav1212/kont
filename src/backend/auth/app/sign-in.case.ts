import { IAuthRepository } from "../domain/repository/auth.repository";
import { Auth } from "../domain/auth";
import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";

export interface SignInInput {
    email: string;
    pass: string;
}

export class SignInUseCase extends UseCase<SignInInput, Auth> {
    constructor(private readonly authRepository: IAuthRepository) {
        super();
    }

    async execute(input: SignInInput): Promise<Result<Auth>> {
        return await this.authRepository.signIn(input.email, input.pass);
    }
}