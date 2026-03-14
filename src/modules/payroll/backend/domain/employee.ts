export type EmployeeEstado = "activo" | "inactivo" | "vacacion";
export type EmployeeMoneda = "VES" | "USD";

export interface Employee {
    id?:            string;           // cedula como PK — opcional al crear
    companyId:      string;
    cedula:         string;
    nombre:         string;
    cargo:          string;
    salarioMensual: number;           // en la moneda indicada por `moneda`
    moneda:         EmployeeMoneda;   // VES (default) o USD
    estado:         EmployeeEstado;
    fechaIngreso?:  string | null;    // YYYY-MM-DD, opcional
}

export interface SalaryHistoryEntry {
    id:             string;
    salarioMensual: number;
    moneda:         EmployeeMoneda;
    fechaDesde:     string;    // YYYY-MM-DD
    createdAt:      string;
}
