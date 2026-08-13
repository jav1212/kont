import { companyId } from "@kontave/companies-domain";
import { employeeId } from "@kontave/employees-domain";
import { currency, moneyFromDecimal } from "@kontave/monetary-domain";
import { payrollDefinitionId, payrollElementEntryId, payrollRelationshipId, type PayrollWorkerSnapshot } from "@kontave/payroll-domain";

export const VES = currency("VES", 2);
export const COMPANY_ID = companyId("company-1");
export const DEFINITION_ID = payrollDefinitionId("payroll-1");
export const RELATIONSHIP_ID = payrollRelationshipId("relationship-1");
export const WORKER: PayrollWorkerSnapshot = { relationshipId: RELATIONSHIP_ID, employeeId: employeeId("employee-1"), nationalId: "V123", displayName: "Ada Lovelace", position: "Analista", compensation: [{ effectiveFrom: "2026-01-01", effectiveUntil: null, basis: { kind: "monthly_salary", amount: moneyFromDecimal("1000.00", VES) } }] };
export const entryId = (suffix: string) => payrollElementEntryId(`entry-${suffix}`);
