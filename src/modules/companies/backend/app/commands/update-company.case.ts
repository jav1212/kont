// UpdateCompanyUseCase — validates and updates a company record, then emits CompanyUpdated.
import { Result }               from "@/src/core/domain/result";
import { UseCase }              from "@/src/core/domain/use-case";
import { IEventBus }            from "@/src/core/domain/event-bus";
import { Company }              from "../../domain/company";
import { ICompanyRepository }   from "../../domain/repository/company.repository";
import { CompanyUpdatedPayload } from "../../domain/events/company-updated.event";

export interface UpdateCompanyInput {
    id:   string;
    data: Partial<Company>;
}

export class UpdateCompanyUseCase extends UseCase<UpdateCompanyInput, Company> {
    constructor(
        private readonly repository: ICompanyRepository,
        private readonly eventBus?: IEventBus,
    ) {
        super();
    }

    async execute(input: UpdateCompanyInput): Promise<Result<Company>> {
        if (!input.id) return Result.fail("Company ID is required for update.");

        const result = await this.repository.update(input.id, input.data);

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<CompanyUpdatedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "company.updated",
                occurredAt: new Date().toISOString(),
                payload: {
                    companyId:     input.id,
                    updatedFields: Object.keys(input.data),
                },
            });
        }

        return result;
    }
}
