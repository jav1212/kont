import { Result } from "@/src/core/domain/result";
import { Auth } from "../domain/auth";
import { UseCase } from "@/src/core/domain/use-case";
import { IAuthRepository } from "../domain/repository/auth.repository";

export class GetCurrentUserUseCase extends UseCase<void, Auth | null> {
    constructor(private readonly authRepository: IAuthRepository) {
        super();
    }

    async execute(): Promise<Result<Auth | null>> {
        return await this.authRepository.getCurrentUser();
    }
}