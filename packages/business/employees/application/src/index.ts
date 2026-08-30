import type { CompanyId } from "@kontave/companies/domain";
import {
  EmployeeFailure,
  type Compensation,
  type Employee,
  type EmployeeId,
  type EmployeeLeave,
  type NationalId,
} from "@kontave/employees-domain";
import type { OrganizationId } from "@kontave/organizations/domain";

/** Persistence port owned by the employees application layer. */
export interface EmployeeRepository {
  /** @returns Employees in the company and optional organization scope. */
  list(companyId: CompanyId, organizationId?: OrganizationId): Promise<readonly Employee[]>;
  /** @returns The matching employee, or `null` when absent. */
  findById(companyId: CompanyId, id: EmployeeId): Promise<Employee | null>;
  /** @returns The employee with the national identifier, or `null` when absent. */
  findByNationalId(companyId: CompanyId, nationalId: NationalId): Promise<Employee | null>;
  /** @returns A promise completed after saving the aggregate. */
  save(employee: Employee): Promise<void>;
}

/** Persistence port for effective compensation history. */
export interface CompensationHistoryRepository {
  /** @returns A promise completed after replacing the current compensation record. */
  replaceCurrent(employee: Employee, previous: Compensation | null, reason: string): Promise<void>;
}

/** Persistence port for employee leave records. */
export interface EmployeeLeaveRepository {
  /** @returns Leave records for the employee. */
  list(employeeId: EmployeeId): Promise<readonly EmployeeLeave[]>;
  /** @returns A promise completed after saving the leave record. */
  save(leave: EmployeeLeave): Promise<void>;
}

/** Lists employees while enforcing company ownership on every returned aggregate. */
export class ListCompanyEmployees {
  /** @param repository - Employee persistence port. */
  constructor(private readonly repository: EmployeeRepository) {}

  /**
   * @param organizationId - Organization scope used by persistence authorization.
   * @param companyId - Owning company.
   * @returns Employees that belong to the company.
   * @throws {EmployeeFailure} When ownership is violated or persistence fails.
   */
  async execute(organizationId: OrganizationId, companyId: CompanyId): Promise<readonly Employee[]> {
    const rows = await repositoryCall(() => this.repository.list(companyId, organizationId));
    for (const employee of rows) employee.assertBelongsTo(companyId);
    return rows;
  }
}

/** Retrieves one company-owned employee. */
export class GetCompanyEmployee {
  /** @param repository - Employee persistence port. */
  constructor(private readonly repository: EmployeeRepository) {}

  /**
   * @param companyId - Expected owning company.
   * @param id - Employee identifier.
   * @returns The matching company-owned employee.
   * @throws {EmployeeFailure} When absent, outside the company or persistence fails.
   */
  async execute(companyId: CompanyId, id: EmployeeId): Promise<Employee> {
    const employee = await repositoryCall(() => this.repository.findById(companyId, id));
    if (!employee) throw new EmployeeFailure("EMPLOYEE_NOT_FOUND", "The employee does not exist.");
    employee.assertBelongsTo(companyId);
    return employee;
  }
}

/** Hires an employee and establishes the initial compensation history. */
export class HireEmployee {
  /**
   * @param repository - Employee persistence port.
   * @param history - Compensation-history persistence port.
   */
  constructor(
    private readonly repository: EmployeeRepository,
    private readonly history: CompensationHistoryRepository,
  ) {}

  /**
   * @param employee - New employee aggregate.
   * @param reason - Audit reason for initial compensation.
   * @returns The persisted employee.
   * @throws {EmployeeFailure} When the national identifier exists or persistence fails.
   */
  async execute(employee: Employee, reason: string): Promise<Employee> {
    const duplicate = await repositoryCall(() => (
      this.repository.findByNationalId(employee.companyId, employee.person.nationalId)
    ));
    if (duplicate) {
      throw new EmployeeFailure(
        "EMPLOYEE_DUPLICATE_NATIONAL_ID",
        "The company already has this national identifier.",
      );
    }
    await repositoryCall(() => this.repository.save(employee));
    await repositoryCall(() => this.history.replaceCurrent(employee, null, reason));
    return employee;
  }
}

/** Changes employee compensation while retaining the previous effective value. */
export class ChangeEmployeeCompensation {
  /**
   * @param repository - Employee persistence port.
   * @param history - Compensation-history persistence port.
   */
  constructor(
    private readonly repository: EmployeeRepository,
    private readonly history: CompensationHistoryRepository,
  ) {}

  /**
   * @param companyId - Expected owning company.
   * @param id - Employee identifier.
   * @param next - New effective compensation.
   * @param reason - Audit reason for the change.
   * @returns The changed employee aggregate.
   * @throws {EmployeeFailure} When validation, ownership or persistence fails.
   */
  async execute(
    companyId: CompanyId,
    id: EmployeeId,
    next: Compensation,
    reason: string,
  ): Promise<Employee> {
    const current = await new GetCompanyEmployee(this.repository).execute(companyId, id);
    const changed = current.changeCompensation(next);
    await repositoryCall(() => this.history.replaceCurrent(changed, current.compensation, reason));
    await repositoryCall(() => this.repository.save(changed));
    return changed;
  }
}

async function repositoryCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof EmployeeFailure) throw cause;
    throw new EmployeeFailure("EMPLOYEE_REPOSITORY_UNAVAILABLE", "No se pudo acceder a los empleados.", { cause });
  }
}
