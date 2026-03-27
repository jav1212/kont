# Kont - Documentacion del Proyecto

## 1. Resumen ejecutivo

Kont es una plataforma SaaS de gestion empresarial orientada a Venezuela. El proyecto combina modulos de nomina, inventario, documentos, empresas, facturacion y una consola administrativa de plataforma.

La aplicacion esta construida principalmente con:

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- HeroUI
- Supabase
- Serwist/PWA

El proyecto no es una plantilla simple: tiene arquitectura multi-tenant, seguridad por roles, modulos de negocio separados y una capa importante de logica en base de datos mediante migraciones y funciones RPC.

## 2. Objetivo del producto

El sistema busca centralizar operaciones empresariales en una sola plataforma:

- Gestion de nomina
- Gestion de inventario
- Gestion documental
- Gestion de empresas
- Facturacion y planes
- Administracion de clientes/tenants de la plataforma

Tambien incorpora capacidades pensadas para el contexto venezolano, como integracion con tasa BCV y flujos fiscales/administrativos especificos del dominio.

## 3. Stack tecnico

### Frontend

- Next.js App Router
- React 19
- TypeScript con `strict: true`
- Tailwind CSS v4
- HeroUI
- Framer Motion

### Backend

- Next.js Route Handlers en `app/api`
- Supabase Auth
- Supabase Database
- Supabase Storage
- RPCs y SQL en migraciones

### Otros

- PWA con Serwist
- Generacion de PDFs con `jspdf`
- Emails con `resend`
- Validaciones con `zod`

## 4. Estructura general del repositorio

```text
app/
  (public)/        -> landing, auth publica
  (app)/           -> aplicacion autenticada
  admin/           -> consola admin del SaaS
  api/             -> endpoints del backend

src/
  core/            -> abstracciones base
  modules/         -> logica por dominio
  shared/          -> componentes y utilidades compartidas

supabase/
  migrations/      -> estructura y evolucion de la base de datos
```

## 5. Capas de arquitectura

La aplicacion esta organizada en cuatro capas principales:

### 5.1 `app/`

Es la capa de entrega de Next.js.

Incluye:

- layouts globales y por seccion
- paginas
- rutas API
- middleware

Su responsabilidad ideal es coordinar la UI o recibir requests, sin concentrar demasiada logica de negocio.

### 5.2 `src/modules/`

Es la capa mas importante del negocio. Aqui vive la separacion por dominios funcionales.

Cada modulo tiende a dividirse en:

- `frontend/`: hooks, componentes, utilidades de UI
- `backend/app/`: casos de uso
- `backend/domain/`: entidades y tipos de dominio
- `backend/infra/`: repositorios, factories y acceso a Supabase

Los modulos actuales identificados son:

- `auth`
- `billing`
- `companies`
- `documents`
- `inventory`
- `memberships`
- `payroll`
- `users`

### 5.3 `src/shared/`

Contiene piezas reutilizables por toda la plataforma:

- componentes base de UI
- hooks comunes
- helpers de frontend
- wrappers de seguridad backend
- navegacion
- adaptadores compartidos

### 5.4 `supabase/`

Es una parte central de la arquitectura, no un detalle secundario.

Aqui esta la evolucion del sistema de datos:

- tablas del dominio
- RLS
- buckets/storage
- funciones SQL/RPC
- cambios de seguridad y rendimiento

## 6. Flujo general de la aplicacion

El flujo tipico de una funcionalidad sigue este patron:

```text
Pagina o componente
-> hook frontend
-> fetch a /api/...
-> wrapper de auth/tenant/admin
-> factory del modulo
-> caso de uso
-> repositorio
-> Supabase / RPC / Storage
```

Esto aparece de forma clara en modulos como `documents` e `inventory`.

## 7. Rutas principales

### 7.1 Rutas publicas

Ubicadas principalmente en `app/(public)`.

Incluyen:

- landing page
- sign in
- sign up
- forgot password
- reset password
- accept invite

La landing consume planes dinamicos desde backend, por lo que no es solo una pagina estatica.

### 7.2 Rutas privadas de la app

Ubicadas en `app/(app)`.

Incluyen:

- `billing`
- `companies`
- `documents`
- `inventory`
- `payroll`
- `settings`

Estas pantallas corresponden a la experiencia del cliente autenticado.

### 7.3 Rutas de administracion

Ubicadas en `app/admin`.

Esta seccion es una consola separada para operar el SaaS y no solo una vista mas del producto.

Incluye capacidades como:

- ver resumen de plataforma
- gestionar tenants
- revisar pagos
- administrar planes
- gestionar suscripciones
- administrar usuarios admin

## 8. Middleware y control de acceso

El archivo `middleware.ts` es una pieza arquitectonica critica.

Responsabilidades principales:

- separar sesiones de cliente y admin
- proteger rutas privadas
- redirigir segun estado de autenticacion
- impedir que un admin use rutas de cliente y viceversa
- validar estado del tenant antes de permitir acceso a ciertos modulos

Este middleware hace que la seguridad no quede dispersa en cada pagina.

## 9. Multi-tenant

Uno de los conceptos mas importantes del proyecto es el soporte multi-tenant.

### 9.1 Idea general

Cada usuario/tenant opera sobre su propio contexto de datos.

Ademas, existe la capacidad de actuar sobre otro tenant cuando hay membresias activas, por ejemplo en escenarios donde un contable trabaja para clientes.

### 9.2 `X-Tenant-Id`

En frontend existe un wrapper de fetch que inyecta automaticamente el header `X-Tenant-Id` cuando hay un tenant activo.

Eso permite que la API sepa si el usuario esta:

- operando sobre su propio tenant
- actuando sobre el tenant de un cliente al que tiene acceso

### 9.3 Resolucion de tenant en backend

El helper `require-tenant.ts`:

- autentica al usuario con Supabase
- detecta si viene `X-Tenant-Id`
- valida membresia si el tenant destino no es el propio
- construye el contexto `actingAs`

Este es uno de los puntos mas importantes del modelo de seguridad del sistema.

## 10. Estado global de la app

La app autenticada se monta sobre dos contextos de negocio relevantes:

### 10.1 Tenant activo

Maneja el tenant sobre el cual el usuario esta operando.

### 10.2 Empresa activa

Dentro del tenant actual, algunas vistas operan sobre una empresa concreta.

Esto muestra que la navegacion de negocio tiene al menos dos niveles:

- nivel tenant
- nivel empresa

## 11. Modulos del dominio

### 11.1 Auth

Responsable de:

- sign in
- sign up
- sign out
- obtener usuario actual
- validaciones relacionadas con login

### 11.2 Billing

Responsable de:

- planes
- capacidad del tenant
- suscripciones
- tenant billing info
- solicitudes de pago

Es clave para el modelo SaaS.

### 11.3 Companies

Responsable de:

- crear empresas
- actualizar empresas
- obtener empresas del usuario
- manejar empresa activa en frontend

### 11.4 Documents

Responsable de:

- carpetas
- documentos
- upload/download
- storage
- replicacion de estructura de carpetas

Este modulo muestra una integracion clara entre frontend, API, casos de uso y storage.

### 11.5 Inventory

Es uno de los modulos mas grandes del sistema.

Incluye:

- productos
- movimientos
- kardex
- proveedores
- facturas de compra
- departamentos
- transformaciones
- reportes
- libros fiscales/operativos

Gran parte de su logica parece apoyarse en funciones RPC y SQL especializadas.

### 11.6 Memberships

Responsable de:

- invitaciones
- aceptacion de membresias
- listado de miembros
- cambio de tenant activo

Es el modulo que hace posible la operacion multi-tenant compartida.

### 11.7 Payroll

Responsable de:

- empleados
- corridas de nomina
- recibos
- historiales
- exportaciones
- generacion de PDFs

Tambien concentra bastante logica especifica de negocio venezolano.

### 11.8 Users

Responsable de operaciones CRUD de usuarios, con su propia capa backend.

## 12. Patron backend por modulo

Los modulos backend usan un patron repetido bastante sano:

### 12.1 Casos de uso

Cada accion importante se modela como caso de uso, por ejemplo:

- obtener
- guardar
- eliminar
- confirmar
- actualizar

### 12.2 Repositorios

La infraestructura implementa repositorios que hablan con Supabase, RPC o storage.

### 12.3 Factories

Las factories crean repositorios y luego exponen los casos de uso ya ensamblados.

Este patron reduce acoplamiento entre la ruta API y la infraestructura real.

## 13. Capa API

La carpeta `app/api` agrupa endpoints por area:

- `admin`
- `auth`
- `bcv`
- `billing`
- `companies`
- `documents`
- `employees`
- `inventory`
- `memberships`
- `payroll`
- `users`

Hay dos estilos conviviendo:

- rutas que delegan bien a modulos/casos de uso
- rutas que aun consultan Supabase de forma mas directa

Esto sugiere que la arquitectura va en camino de consolidarse, pero todavia no esta completamente homogenea.

## 14. Supabase como centro del dominio

Las migraciones muestran una evolucion rica del negocio. Algunos temas visibles:

- esquema SaaS inicial
- aprovisionamiento de tenant
- vistas de BI/admin
- enforcement de limites de planes
- consolidacion de politicas RLS
- tablas y funciones de inventario
- tablas y funciones de documentos
- memberships
- buckets de avatars
- campos fiscales de companies

Conclusion: una parte importante de la logica de negocio esta en la base de datos y no solamente en React o en las API routes.

## 15. UI y experiencia de usuario

La UI usa:

- layouts por contexto
- sidebar de aplicacion
- topbar mobile
- componentes base compartidos
- estilos propios sobre HeroUI y Tailwind

Tambien hay señales de soporte PWA:

- `app/offline/page.tsx`
- `app/sw.ts`
- dependencias `serwist` y `@serwist/next`

## 16. Estado actual de la documentacion

Actualmente el `README.md` del proyecto sigue siendo muy generico y describe una app base de Next.js.

Eso no representa correctamente:

- el alcance del producto
- la arquitectura multi-tenant
- los modulos funcionales
- la dependencia fuerte de Supabase
- la consola admin
- los flujos reales del negocio

Este documento busca cubrir ese vacio como base de documentacion interna.

## 17. Estado tecnico observado

A nivel arquitectonico, el proyecto tiene buenas decisiones:

- separacion por modulos
- wrappers de seguridad
- soporte multi-tenant
- dominio explicito
- factories y casos de uso
- backend apoyado en SQL/RPC donde tiene sentido

Pero a nivel de higiene tecnica, la base necesita consolidacion:

- el linter reporta muchos errores y warnings
- hay varios `any`
- hay varios `setState` dentro de `useEffect`
- algunas paginas son muy grandes y mezclan UI con bastante coordinacion de estado
- algunos componentes base necesitan revision estructural

En otras palabras:

- la arquitectura conceptual esta bastante bien
- la mantenibilidad actual puede mejorar bastante

## 18. Fortalezas del proyecto

- El dominio del producto esta bien definido
- El sistema ya cubre varias areas de negocio reales
- La separacion por modulos es una buena base para crecer
- El modelo multi-tenant esta pensado con bastante seriedad
- Existe una frontera clara entre experiencia cliente y experiencia admin
- Supabase esta integrado como backend de verdad, no solo como autenticacion

## 19. Riesgos o puntos de atencion

- Documentacion insuficiente para onboarding rapido
- Inconsistencia entre algunos endpoints y el patron modular
- Deuda tecnica visible en lint y tipado
- Dependencia fuerte de logica RPC/SQL que exige buena documentacion
- Varias pantallas grandes pueden volverse dificiles de mantener

## 20. Recomendaciones de documentacion

Para continuar mejorando la documentacion del proyecto, conviene crear al menos estos documentos:

- `README.md` renovado con vision del producto y pasos reales de arranque
- guia de arquitectura por capas
- guia de modulos del negocio
- guia de multi-tenant y seguridad
- guia de Supabase: tablas, RPC y buckets
- guia de despliegue y variables de entorno
- guia de convenciones del codigo

## 21. Siguientes pasos recomendados

Orden sugerido para seguir documentando el proyecto:

1. Actualizar `README.md` para que deje de ser generico
2. Documentar variables de entorno y dependencias externas
3. Documentar el modelo multi-tenant
4. Documentar inventario y nomina, que parecen ser modulos de mayor complejidad
5. Documentar migraciones y RPCs clave de Supabase
6. Hacer una auditoria tecnica priorizada para limpieza de deuda

## 22. Resumen final

Kont es una plataforma SaaS empresarial multi-tenant con una arquitectura modular razonablemente solida y un dominio funcional amplio. La aplicacion ya supera por mucho la complejidad de una app estandar de Next.js y depende de una combinacion de frontend modular, API routes, wrappers de seguridad, contexto multi-tenant y una capa importante de logica en Supabase.

La base del proyecto es prometedora, pero necesita mejor documentacion y una etapa de consolidacion tecnica para que el crecimiento futuro sea mas facil de sostener.
