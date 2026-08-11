# ADR 0008: Organizaciones como espacios de trabajo

- Estado: aceptado
- Fecha: 2026-08-11

## Contexto

El modelo histórico identifica cada tenant con el UUID de un usuario de Supabase. Esto acopla la identidad humana, la propiedad de datos, la suscripción y el espacio de trabajo. Impide transferir propiedad limpiamente y dificulta que una persona participe en varias organizaciones.

## Decisión

El modelo portable nuevo usa cuatro conceptos independientes:

- `User`: identidad autenticada.
- `Organization`: espacio de trabajo propietario de datos y suscripción.
- `OrganizationMembership`: relación de un usuario con una organización, incluyendo rol, estado y permisos.
- `OrganizationCompany`: entidad fiscal u operativa perteneciente a una organización.

`packages/organizations/domain` no conoce Supabase, SQL, Next.js ni Electron. Los casos de uso y puertos viven en `application`; la traducción del esquema físico y de los roles históricos vive en `supabase`.

## Compatibilidad

La migración 197 es aditiva. Mantiene `tenants`, `tenant_memberships`, `tenant_id` y las APIs Web actuales. Crea organizaciones equivalentes, membresías y `shared_companies.organization_id`, además de sincronización temporal desde las escrituras heredadas.

La migración se aplicará y verificará separadamente antes de habilitar los endpoints de organizaciones en un cliente publicado. Web no se migrará hasta completar un cutover específico y reversible.

## API nativa

- `GET /api/native/v1/organizations`
- `GET /api/native/v1/organizations/:organizationId`
- `GET /api/native/v1/organizations/:organizationId/companies`
- `GET /api/native/v1/organizations/:organizationId/companies/:companyId`

Cada operación verifica el token y la membresía activa en la capa de aplicación. Los identificadores recibidos por HTTP se convierten a tipos nominales antes de invocar casos de uso.

## Consecuencias

- Un usuario puede pertenecer a múltiples organizaciones.
- Una organización puede sobrevivir a cambios de propietario o miembros.
- Las empresas y futuras operaciones se autorizan por organización.
- La deuda histórica queda confinada al adaptador y a la sincronización de transición.
