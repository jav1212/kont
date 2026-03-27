# Kont

Plataforma SaaS de gestion empresarial orientada a Venezuela, con modulos de nomina, inventario, documentos, empresas, facturacion y administracion de plataforma.

## Vision general

Kont centraliza operaciones empresariales en una sola aplicacion web con arquitectura multi-tenant. El sistema separa claramente:

- experiencia publica
- experiencia del cliente autenticado
- consola administrativa del SaaS

La aplicacion usa Next.js como capa web y Supabase como backend principal para autenticacion, base de datos, storage y parte de la logica del dominio.

## Funcionalidades principales

- Nomina
- Inventario
- Gestion de documentos
- Gestion de empresas
- Facturacion y planes
- Membresias entre tenants
- Consola administrativa de plataforma
- Soporte PWA

## Stack tecnico

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- HeroUI
- Supabase
- Serwist
- jsPDF
- Zod

## Arquitectura resumida

El repositorio esta organizado en capas:

```text
app/        -> rutas, layouts, paginas y API routes
src/
  core/     -> abstracciones base
  modules/  -> logica por dominio
  shared/   -> componentes y utilidades compartidas
supabase/   -> migraciones, seguridad y evolucion del modelo de datos
```

Los modulos en `src/modules` concentran la logica del negocio y suelen separarse en:

- `frontend`
- `backend/app`
- `backend/domain`
- `backend/infra`

## Modulos del sistema

- `auth`
- `billing`
- `companies`
- `documents`
- `inventory`
- `memberships`
- `payroll`
- `users`

## Multi-tenant y seguridad

El proyecto incluye soporte multi-tenant. Un usuario puede operar sobre su propio tenant o, cuando corresponde, actuar sobre otro tenant mediante membresias.

Piezas importantes:

- `middleware.ts`: protege rutas, separa sesiones admin y cliente, y valida acceso
- `src/shared/backend/utils/require-tenant.ts`: resuelve contexto del tenant actual
- `src/shared/backend/utils/require-admin.ts`: valida acceso de administracion
- `src/shared/frontend/utils/api-fetch.ts`: inyecta `X-Tenant-Id` en frontend cuando aplica

## Estructura de rutas

### Publicas

- `/`
- `/sign-in`
- `/sign-up`
- `/forgot-password`
- `/reset-password`

### App autenticada

- `/payroll`
- `/inventory`
- `/companies`
- `/billing`
- `/documents`
- `/settings`

### Administracion

- `/admin`
- `/admin/sign-in`

## Desarrollo local

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Configurar variables de entorno

Este proyecto depende de Supabase y otros servicios externos. Debes definir al menos las variables necesarias en tu entorno local, por ejemplo en `.env.local`.

Variables esperadas en distintas partes del codigo:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Segun la funcionalidad que vayas a usar, pueden existir otras variables adicionales.

### 3. Ejecutar en desarrollo

```bash
pnpm dev
```

La app quedara disponible normalmente en:

```text
http://localhost:3000
```

## Scripts disponibles

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

## Base de datos y Supabase

La carpeta `supabase/migrations` contiene la evolucion del sistema de datos. Ahi se refleja gran parte del dominio real:

- aprovisionamiento SaaS
- politicas RLS
- billing
- memberships
- documentos
- inventario
- buckets y storage

Supabase no se usa solo para auth: es una parte central de la arquitectura del producto.

## Documentacion interna

La documentacion base del proyecto esta en:

- [docs/project/PROJECT_DOCUMENTATION.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/project/PROJECT_DOCUMENTATION.md)
- [docs/database/README.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/database/README.md)
- [docs/security/README.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/security/README.md)
- [docs/architecture/MODULES_CATALOG.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/architecture/MODULES_CATALOG.md)
- [docs/requirements/README.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/requirements/README.md)
- [docs/README.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/README.md)

Ese documento explica con mas detalle:

- vision del producto
- arquitectura por capas
- modulos del dominio
- flujo de datos
- multi-tenant
- seguridad
- estado tecnico observado

## Estado actual del proyecto

El proyecto ya tiene una base funcional amplia y una arquitectura modular clara, pero todavia necesita consolidacion tecnica en algunas areas, especialmente:

- higiene de lint
- consistencia entre modulos
- documentacion operativa
- revision de algunos componentes base y hooks

## Recomendaciones para onboarding

Si estas entrando al proyecto, conviene seguir este orden:

1. Leer este `README.md`
2. Leer `docs/project/PROJECT_DOCUMENTATION.md`
3. Revisar `middleware.ts`
4. Revisar `app/(app)/layout.tsx`
5. Revisar `src/modules` para entender el dominio
6. Revisar `supabase/migrations` para entender el modelo de datos

## Notas

- El `README` original de `create-next-app` fue reemplazado porque ya no representaba la complejidad real del sistema.
- La documentacion debe seguir creciendo junto con los modulos y migraciones.
