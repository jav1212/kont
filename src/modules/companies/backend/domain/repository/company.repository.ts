import { Result } from "@/src/core/domain/result";
import { Company, InventoryConfig } from "../company";

export interface ICompanyRepository {
    save(company: Company): Promise<Result<void>>;
    update(id: string, company: Partial<Company>): Promise<Result<Company>>;
    delete(id: string): Promise<Result<void>>;
    findById(id: string): Promise<Result<Company | null>>;
    findByOwnerId(ownerId: string): Promise<Result<Company[]>>;
    getInventoryConfig(companyId: string): Promise<Result<InventoryConfig>>;
    saveInventoryConfig(companyId: string, config: InventoryConfig): Promise<Result<void>>;
}