// Application layer — applies a sector template to a company.
// Cross-module: reads sector template from inventory domain, writes departments
// via inventory repository, updates company sector + inventoryConfig.
import { Result }                       from '@/src/core/domain/result';
import { UseCase }                      from '@/src/core/domain/use-case';
import { BusinessSector, InventoryConfig, BUSINESS_SECTORS } from '../../domain/company';
import { ICompanyRepository }           from '../../domain/repository/company.repository';
import { IDepartmentRepository }        from '@/src/modules/inventory/backend/domain/repository/department.repository';
import { getSectorTemplate }            from '@/src/modules/inventory/backend/domain/sector-template';
import type { Company }                 from '../../domain/company';

export interface ApplySectorTemplateInput {
  companyId: string;
  sector: BusinessSector;
}

export class ApplySectorTemplateUseCase extends UseCase<ApplySectorTemplateInput, Company> {
  constructor(
    private readonly companyRepo: ICompanyRepository,
    private readonly departmentRepo: IDepartmentRepository,
  ) {
    super();
  }

  async execute(input: ApplySectorTemplateInput): Promise<Result<Company>> {
    if (!BUSINESS_SECTORS.includes(input.sector)) {
      return Result.fail(`Invalid sector: ${input.sector}`);
    }

    const template = getSectorTemplate(input.sector);

    // Build inventory config from template defaults
    const inventoryConfig: InventoryConfig = {
      customFields:          template.defaultCustomFields,
      visibleColumns:        template.visibleColumns,
      defaultMeasureUnit:    template.suggestedMeasureUnits[0],
      defaultValuationMethod: template.defaultValuationMethod,
    };

    // Update company sector
    const updateResult = await this.companyRepo.update(input.companyId, {
      sector: input.sector,
    });
    if (!updateResult.isSuccess) return updateResult;

    // Persist inventory config via dedicated RPC (update() does not handle it)
    const configResult = await this.companyRepo.saveInventoryConfig(input.companyId, inventoryConfig);
    if (!configResult.isSuccess) return Result.fail(configResult.getError());

    // Auto-create suggested departments (skip existing by name)
    if (template.suggestedDepartments.length > 0) {
      const existingResult = await this.departmentRepo.findByCompany(input.companyId);
      const existingNames = new Set(
        existingResult.isSuccess
          ? existingResult.getValue().map(d => d.name.toLowerCase())
          : [],
      );

      for (const deptName of template.suggestedDepartments) {
        if (!existingNames.has(deptName.toLowerCase())) {
          await this.departmentRepo.upsert({
            companyId: input.companyId,
            name: deptName,
            active: true,
          });
        }
      }
    }

    return updateResult;
  }
}
