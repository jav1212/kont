// Application layer — validates and persists a new company, then emits CompanySaved.
import { ICompanyRepository }  from "../../domain/repository/company.repository";
import { Company }             from "../../domain/company";
import { Result }              from "@/src/core/domain/result";
import { UseCase }             from "@/src/core/domain/use-case";
import { IEventBus }           from "@/src/core/domain/event-bus";
import { CompanySavedPayload } from "../../domain/events/company-saved.event";

export class SaveCompanyUseCase extends UseCase<Company, void> {
    constructor(
        private readonly repository: ICompanyRepository,
        private readonly eventBus?: IEventBus,
    ) {
        super();
    }

    async execute(company: Company): Promise<Result<void>> {
        if (!company.name || company.name.trim().length < 2) {
            return Result.fail("El nombre de la empresa debe tener al menos 2 caracteres.");
        }
        if (!company.ownerId) {
            return Result.fail("La empresa debe estar vinculada a un dueño (ownerId).");
        }

        const result = await this.repository.save(company);

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<CompanySavedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "company.saved",
                occurredAt: new Date().toISOString(),
                payload: {
                    companyId: company.id,
                    ownerId:   company.ownerId,
                    name:      company.name,
                },
            });
        }

        return result;
    }
}
