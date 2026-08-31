import type { CompanyId } from "@kontave/companies/domain";
import type { EmployeeRepository } from "../application";
import type { Employee, EmployeeId, NationalId } from "../domain";

/** Deterministic mutable employee repository for application tests. */
export class InMemoryEmployeeRepository implements EmployeeRepository {
  /** @param employees - Initial records; subsequent writes mutate this array. */
  constructor(readonly employees: Employee[] = []) {}

  /** {@inheritDoc EmployeeRepository.list} */
  async list(companyId: CompanyId): Promise<readonly Employee[]> {
    return this.employees.filter((employee) => employee.companyId === companyId);
  }

  /** {@inheritDoc EmployeeRepository.findById} */
  async findById(companyId: CompanyId, id: EmployeeId): Promise<Employee | null> {
    return this.employees.find((employee) => employee.companyId === companyId && employee.id === id) ?? null;
  }

  /** {@inheritDoc EmployeeRepository.findByNationalId} */
  async findByNationalId(companyId: CompanyId, id: NationalId): Promise<Employee | null> {
    return this.employees.find((employee) => (
      employee.companyId === companyId && employee.person.nationalId === id
    )) ?? null;
  }

  /** {@inheritDoc EmployeeRepository.save} */
  async save(employee: Employee): Promise<void> {
    const index = this.employees.findIndex((candidate) => candidate.id === employee.id);
    if (index < 0) this.employees.push(employee);
    else this.employees.splice(index, 1, employee);
  }
}
