# ADR 0010: Employees antes de separar People y Employment

- Estado: aceptado
- Fecha: 2026-08-12

## Contexto

Una persona y su relación laboral no son el mismo concepto. Una persona puede trabajar para varias empresas, salir y reingresar, mientras cada relación laboral conserva cargo, compensación, ausencias e historial propios. `Company` es el límite legal y operativo propietario de esa relación.

## Bounded contexts recomendados

La separación final prevista es:

```text
packages/people/
├── domain
├── application
├── contracts
├── supabase
└── testing

packages/employment/
├── domain
├── application
├── contracts
├── supabase
└── testing
```

Para evitar fragmentación prematura, la implementación inicial será:

```text
packages/employees/
├── domain
├── application
├── contracts
├── supabase
└── testing
```

## Decisión

`Employee` representa una relación laboral perteneciente obligatoriamente a `CompanyId`, no una persona global. Dentro del agregado se mantienen límites explícitos entre `PersonIdentity`, `EmploymentRelationship` y `Compensation`; las ausencias son entidades separadas y vacaciones no es un estado laboral.

`EmployeeId` es un UUID interno. Cédula o pasaporte se modelan como `NationalId` y son únicos por empresa. `legacyEmployeeId` conserva la correspondencia temporal con `shared_employees`.

Todos los repositorios reciben `CompanyId`, y las operaciones nativas deberán resolver antes un `CompanyExecutionContext` autorizado con la capacidad `payroll.employees`.

## Criterios para extraer People

Se extraerá `packages/people` cuando una identidad deba compartirse entre dos empresas, actuar como cliente/proveedor/candidato, o necesite un ciclo de vida independiente de la relación laboral.

## Criterios para extraer Employment

Se extraerá `packages/employment` cuando existan múltiples relaciones o contratos por persona y empresa, reingresos que requieran conservar contratos separados, o procesos laborales reutilizables fuera de nómina.

## Compatibilidad

La implementación es aditiva. Web continúa utilizando `shared_employees` y `shared_employee_salary_history`; las nuevas tablas y API nativa no reemplazan esos flujos hasta un cutover explícito y validado.
