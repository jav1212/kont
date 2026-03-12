import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { Company } from "../domain/company";
import { ICompanyRepository } from "../domain/repository/company.repository";

export interface UpdateCompanyInput {
    id: string;
    data: Partial<Company>;
}

export class UpdateCompanyUseCase extends UseCase<UpdateCompanyInput, Company> {
    constructor(private readonly repository: ICompanyRepository) {
        super();
    }

    async execute(input: UpdateCompanyInput): Promise<Result<Company>> {
        if (!input.id) return Result.fail("Se requiere el ID de la empresa para actualizar.");
        return await this.repository.update(input.id, input.data);
    }
}