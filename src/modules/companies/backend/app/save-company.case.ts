import { ICompanyRepository } from "../domain/repository/company.repository";
import { Company } from "../domain/company";
import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";

export class SaveCompanyUseCase extends UseCase<Company, void> {
    constructor(private readonly repository: ICompanyRepository) {
        super();
    }

    async execute(company: Company): Promise<Result<void>> {
        if (!company.name || company.name.trim().length < 2) {
            return Result.fail("El nombre de la empresa debe tener al menos 2 caracteres.");
        }
        if (!company.ownerId) {
            return Result.fail("La empresa debe estar vinculada a un dueño (ownerId).");
        }
        return await this.repository.save(company);
    }
}