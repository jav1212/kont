import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { ICompanyRepository } from "../domain/repository/company.repository";

export class DeleteCompanyUseCase extends UseCase<string, void> {
    constructor(private readonly repository: ICompanyRepository) {
        super();
    }

    async execute(id: string): Promise<Result<void>> {
        if (!id) return Result.fail("Se requiere el ID para eliminar la empresa.");
        return await this.repository.delete(id);
    }
}