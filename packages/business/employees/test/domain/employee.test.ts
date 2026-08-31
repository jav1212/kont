import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import {
  Currency,
  Employee,
  EmployeeStatus,
  EmploymentType,
  employeeId,
  nationalId,
} from "../../src/domain";

function activeEmployee(): Employee {
  return new Employee({
    id: employeeId("employee-1"),
    companyId: companyId("company-1"),
    legacyEmployeeId: "V-1",
    person: { nationalId: nationalId("V-1"), fullName: " Ana Pérez " },
    employment: {
      position: "Analista",
      hiredOn: "2026-01-01",
      type: EmploymentType.Indefinite,
      terminatedOn: null,
    },
    compensation: {
      monthlySalaryMinor: 10_000n,
      currency: Currency.VES,
      effectiveFrom: "2026-01-01",
    },
    status: EmployeeStatus.Active,
    version: 1,
  });
}

test("employment is owned by a company and transitions preserve history version", () => {
  const employee = activeEmployee();
  assert.equal(employee.person.fullName, "Ana Pérez");
  assert.equal(employee.terminate("2026-08-01").version, 2);
});

test("rejects impossible calendar dates", () => {
  assert.throws(() => activeEmployee().terminate("2026-02-30"));
});
