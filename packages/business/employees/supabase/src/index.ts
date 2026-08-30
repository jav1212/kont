import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId, type CompanyId } from "@kontave/companies/domain";
import type { CompensationHistoryRepository, EmployeeRepository } from "@kontave/employees-application";
import {
  Employee,
  EmployeeFailure,
  employeeId,
  nationalId,
  type Compensation,
  type EmployeeId,
  type NationalId,
} from "@kontave/employees-domain";
import type { OrganizationId } from "@kontave/organizations/domain";
import { employeeRowSchema } from "./persistence-codecs";

/** Credentials required by the server-side employees adapter. */
export interface EmployeeSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/**
 * Creates employee and compensation-history adapters sharing one stateless client.
 *
 * @param configuration - Supabase endpoint and service-role credential.
 * @returns Infrastructure adapters for the employees capability.
 * @throws When the Supabase client rejects invalid construction parameters.
 */
export function createEmployeeInfrastructure(configuration: EmployeeSupabaseConfiguration): {
  employees: EmployeeRepository;
  compensations: CompensationHistoryRepository;
} {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    employees: new SupabaseEmployeeRepository(client),
    compensations: new SupabaseCompensationHistory(client),
  };
}

class SupabaseEmployeeRepository implements EmployeeRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc EmployeeRepository.list} */
  async list(id: CompanyId, organizationId?: OrganizationId): Promise<readonly Employee[]> {
    return boundary(async () => {
      const { data, error } = await this.client.rpc("list_shared_company_employees", {
        p_company_id: id,
        p_organization_id: organizationId ?? null,
      });
      if (error) throw repositoryFailure(error);
      const decoded = employeeRowSchema.array().safeParse(data ?? []);
      if (!decoded.success) throw repositoryFailure(decoded.error);
      return decoded.data.map(mapEmployee);
    });
  }

  /** {@inheritDoc EmployeeRepository.findById} */
  async findById(company: CompanyId, id: EmployeeId): Promise<Employee | null> {
    return (await this.list(company)).find((employee) => employee.id === id) ?? null;
  }

  /** {@inheritDoc EmployeeRepository.findByNationalId} */
  async findByNationalId(company: CompanyId, id: NationalId): Promise<Employee | null> {
    return (await this.list(company)).find((employee) => employee.person.nationalId === id) ?? null;
  }

  /** {@inheritDoc EmployeeRepository.save} */
  async save(employee: Employee): Promise<void> {
    await boundary(async () => {
      const { error } = await this.client.rpc("save_shared_employee", {
        p_employee_id: employee.id,
        p_company_id: employee.companyId,
        p_national_id: employee.person.nationalId,
        p_full_name: employee.person.fullName,
        p_position: employee.employment.position,
        p_hired_on: employee.employment.hiredOn,
        p_employment_type: employee.employment.type,
        p_terminated_on: employee.employment.terminatedOn,
        p_status: employee.status,
        p_version: employee.version,
      });
      if (error) throw repositoryFailure(error);
    });
  }
}

class SupabaseCompensationHistory implements CompensationHistoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc CompensationHistoryRepository.replaceCurrent} */
  async replaceCurrent(employee: Employee, _previous: Compensation | null, _reason: string): Promise<void> {
    await boundary(async () => {
      const { error } = await this.client.rpc("change_shared_employee_compensation", {
        p_employee_id: employee.id,
        p_company_id: employee.companyId,
        p_monthly_salary_minor: employee.compensation.monthlySalaryMinor.toString(),
        p_currency: employee.compensation.currency,
        p_effective_from: employee.compensation.effectiveFrom,
      });
      if (error) throw repositoryFailure(error);
    });
  }
}

function mapEmployee(row: ReturnType<typeof employeeRowSchema.parse>): Employee {
  return new Employee({
    id: employeeId(row.id),
    companyId: companyId(row.company_id),
    legacyEmployeeId: row.legacy_employee_id,
    person: { nationalId: nationalId(row.national_id), fullName: row.full_name },
    employment: {
      position: row.position,
      hiredOn: row.hired_on,
      type: row.employment_type,
      terminatedOn: row.terminated_on,
    },
    compensation: {
      monthlySalaryMinor: BigInt(row.monthly_salary_minor),
      currency: row.currency,
      effectiveFrom: row.effective_from,
    },
    status: row.status,
    version: row.version,
  });
}

async function boundary<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof EmployeeFailure) throw cause;
    throw repositoryFailure(cause);
  }
}

function repositoryFailure(cause: unknown): EmployeeFailure {
  return new EmployeeFailure("EMPLOYEE_REPOSITORY_UNAVAILABLE", "No se pudo acceder a los empleados.", { cause });
}
