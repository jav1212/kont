// Application layer — removes a company by ID, then emits CompanyDeleted.
import { Result }                from "@/src/core/domain/result";
import { UseCase }               from "@/src/core/domain/use-case";
import { IEventBus }             from "@/src/core/domain/event-bus";
import { ICompanyRepository }    from "../../domain/repository/company.repository";
import { CompanyDeletedPayload } from "../../domain/events/company-deleted.event";

export class DeleteCompanyUseCase extends UseCase<string, void> {
    constructor(
        private readonly repository: ICompanyRepository,
        private readonly eventBus?: IEventBus,
    ) {
        super();
    }

    async execute(id: string): Promise<Result<void>> {
        if (!id) return Result.fail("Se requiere el ID para eliminar la empresa.");

        const result = await this.repository.delete(id);

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<CompanyDeletedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "company.deleted",
                occurredAt: new Date().toISOString(),
                payload: { companyId: id },
            });
        }

        return result;
    }
}
