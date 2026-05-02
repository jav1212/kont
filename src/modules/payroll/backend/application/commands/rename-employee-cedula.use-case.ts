// Application layer — renombra la cédula de un empleado y propaga el cambio
// a payroll_receipts, cesta_ticket_receipts y employee_salary_history.
import { UseCase }              from "@/src/core/domain/use-case";
import { Result }               from "@/src/core/domain/result";
import { IEmployeeRepository }  from "../../domain/repository/employee.repository";

export interface RenameEmployeeCedulaInput {
    companyId:  string;
    oldCedula:  string;
    newCedula:  string;
}

export class RenameEmployeeCedulaUseCase extends UseCase<RenameEmployeeCedulaInput, void> {
    constructor(private readonly repo: IEmployeeRepository) {
        super();
    }

    async execute(input: RenameEmployeeCedulaInput): Promise<Result<void>> {
        const oldCedula = (input.oldCedula ?? "").trim();
        const newCedula = (input.newCedula ?? "").trim();

        if (!input.companyId) return Result.fail("companyId es requerido");
        if (!oldCedula)       return Result.fail("La cédula original es requerida");
        if (!newCedula)       return Result.fail("La cédula nueva es requerida");
        if (oldCedula === newCedula) return Result.success();

        return this.repo.renameCedula(input.companyId, oldCedula, newCedula);
    }
}
