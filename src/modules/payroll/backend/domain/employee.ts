export type EmployeeEstado = "activo" | "inactivo" | "vacacion";

export interface Employee {
    id?:            string;   // text en DB (usa cedula como PK) — opcional al crear
    companyId:      string;
    cedula:         string;
    nombre:         string;
    cargo:          string;
    salarioMensual: number;   // USD
    estado:         EmployeeEstado;
}