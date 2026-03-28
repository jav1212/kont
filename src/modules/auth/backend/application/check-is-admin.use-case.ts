// Application layer — check-is-admin query use case.
// Determines whether a given userId belongs to the admin_users table.
// The route is responsible for session validation; this use case only checks admin membership.
import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { IAdminCheckRepository } from "../domain/repository/admin-check.repository";

export interface CheckIsAdminInput {
    userId: string;
}

export class CheckIsAdminUseCase extends UseCase<CheckIsAdminInput, boolean> {
    constructor(private readonly adminCheckRepository: IAdminCheckRepository) {
        super();
    }

    async execute(input: CheckIsAdminInput): Promise<Result<boolean>> {
        return await this.adminCheckRepository.isAdmin(input.userId);
    }
}
