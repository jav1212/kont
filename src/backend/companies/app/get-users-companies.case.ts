import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { Company } from "../domain/company";
import { ICompanyRepository } from "../domain/repository/company.repository";

export class GetUserCompaniesUseCase extends UseCase<string, Company[]> {
    constructor(private readonly repository: ICompanyRepository) {
        super();
    }

    async execute(ownerId: string): Promise<Result<Company[]>> {
        if (!ownerId) return Result.fail("El ID del dueño es obligatorio.");
        return await this.repository.findByOwnerId(ownerId);
    }
}