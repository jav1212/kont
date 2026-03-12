export type EmployeeEstado = "activo" | "inactivo" | "vacacion";

export interface Employee {
    id?:            number;   // bigint en DB — opcional al crear
    companyId:      string;
    cedula:         string;
    nombre:         string;
    cargo:          string;
    salarioMensual: number;   // USD
    estado:         EmployeeEstado;
}