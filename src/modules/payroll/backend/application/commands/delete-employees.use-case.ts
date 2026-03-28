// Application layer — removes employees by their IDs.
import { Result }               from "@/src/core/domain/result";
import { IEmployeeRepository }  from "../../domain/repository/employee.repository";

export class DeleteEmployeesUseCase {
    constructor(private readonly repo: IEmployeeRepository) {}

    async execute(ids: string[]): Promise<Result<void>> {
        if (!ids.length) return Result.fail("No hay empleados para eliminar");
        return this.repo.deleteByIds(ids);
    }
}
