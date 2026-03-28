// Application layer — validates and batch-upserts employees, then emits EmployeeUpserted.
import { UseCase }              from "@/src/core/domain/use-case";
import { IEventBus }            from "@/src/core/domain/event-bus";
import { IEmployeeRepository }  from "../../domain/repository/employee.repository";
import { Employee }             from "../../domain/employee";
import { Result }               from "@/src/core/domain/result";
import { EmployeeUpsertedPayload } from "../../domain/events/employee-upserted.event";

export interface UpsertEmployeesInput {
    employees: Employee[];
}

export class UpsertEmployeesUseCase extends UseCase<UpsertEmployeesInput, void> {
    constructor(
        private readonly employeeRepository: IEmployeeRepository,
        private readonly eventBus?: IEventBus,
    ) {
        super();
    }

    async execute(input: UpsertEmployeesInput): Promise<Result<void>> {
        if (!input.employees.length) return Result.fail("Employee list is empty");

        const invalid = input.employees.find((e) => !e.cedula || !e.nombre || !e.companyId);
        if (invalid) return Result.fail("All employees must have cedula, nombre, and companyId");

        const result = await this.employeeRepository.upsertByCedula(input.employees);

        if (result.isSuccess && this.eventBus) {
            const companyId = input.employees[0].companyId;
            await this.eventBus.publish<EmployeeUpsertedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "employee.upserted",
                occurredAt: new Date().toISOString(),
                payload: {
                    companyId,
                    employeeCount: input.employees.length,
                },
            });
        }

        return result;
    }
}
