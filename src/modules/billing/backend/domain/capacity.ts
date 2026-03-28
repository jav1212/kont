// TenantCapacity domain entity for the billing module.
// Role: domain — represents the current usage vs plan limits for a tenant.
// Invariant: max === null means unlimited (no cap defined in the plan).

export interface CompanyCapacity {
    used:      number;
    max:       number | null;
    remaining: number | null;
}

export interface EmployeesCapacity {
    max:       number | null;
    byCompany: Record<string, number>;
}

export interface TenantCapacity {
    companies:           CompanyCapacity;
    employeesPerCompany: EmployeesCapacity;
}
