import type { SystemLabelDefinition } from "@kontave/preferences/application";

/** Canonical labels for employee-management controls and directory headings. */
export const EMPLOYEE_SYSTEM_LABELS: readonly SystemLabelDefinition[] = Object.freeze([
  { id: "system.payroll.employees.cedula", defaultLabel: "Cédula", customizable: true },
  { id: "system.payroll.employees.name", defaultLabel: "Nombre", customizable: true },
  { id: "system.payroll.employees.position", defaultLabel: "Cargo", customizable: true },
  { id: "system.payroll.employees.salary", defaultLabel: "Salario mensual", customizable: true },
  { id: "system.payroll.employees.status", defaultLabel: "Estado", customizable: true },
]);
