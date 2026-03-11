import { Result } from "@/src/core/domain/result";
import { UseCase } from "@/src/core/domain/use-case";
import { Company } from "../domain/company";
import { ICompanyRepository } from "../domain/repository/company.repository";

export class GetCompanyByIdUseCase extends UseCase<string, Company | null> {
    constructor(private readonly repository: ICompanyRepository) {
        super();
    }

    async execute(id: string): Promise<Result<Company | null>> {
        return await this.repository.findById(id);
    }
}