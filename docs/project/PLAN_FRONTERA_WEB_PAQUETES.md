# Plan de implementación: frontera cliente/servidor entre Web y `packages/`

- Fecha: 2026-10-22
- Ejecutor previsto: Codex (flujo multiagente de `AGENTS.md`)
- Rama base: `wip/web-production-admin-fiscal`

## Contexto

La Web de producción ya consume 34 workspaces `@kontave/*` (225 archivos,
principalmente `src/client-api/v1/**`, `app/api/**` y algunos componentes
cliente). Las capas `domain`/`application` de los paquetes son portables y
`tooling/architecture` ya lo verifica. Los huecos están en el lado consumidor
(Web) y en la documentación:

| # | Hallazgo | Riesgo |
|---|---|---|
| H1 | `AGENTS.md` y ADR 0005 prohíben que Web dependa de paquetes; el ADR 0039 ya cerró la migración de 17 contextos. | Agentes que siguen una regla obsoleta. |
| H2 | No existe ningún `server-only` ni regla ESLint que impida importar `@kontave/*/supabase`, `/postgres` o composition roots con `SUPABASE_SERVICE_ROLE_KEY` desde componentes `"use client"`. | Código de servidor con service role en el bundle del navegador. |
| H3 | Paquetes como `products`, `companies`, `modules`, `preferences` y `tax-reporting` declaran `@supabase/supabase-js` a nivel de paquete aunque su dominio sea portable. | Solo de legibilidad; `tooling/architecture` ya protege los imports reales. |
| H4 | Las subrutas `/testing` solo se excluyen de producción por convención. | Fixtures en código de producción. |
| H5 | `@kontave/client-contracts` (kernel) depende de `@kontave/treasury/contracts` (import solo de tipos); los demás dominios definen sus DTO localmente. | Acoplamiento kernel → negocio no documentado. |

## Fuera de alcance

- Mover `app/`, `src/` o `public/`.
- Migrar módulos heredados de `src/modules/*` a paquetes.
- Agregar `server-only` **dentro** de `packages/**`: `apps/desktop/src/main/index.ts`
  y `apps/mobile/src/auth/auth-context.tsx` importan `@kontave/auth/supabase`
  fuera de React Server, y el marcador lanza error fuera de la condición
  `react-server`.
- Cambios de API HTTP, base de datos o comportamiento observable.

## Fase 0 — Línea base (agente principal)

Ejecutar y registrar el resultado antes de tocar código:

```bash
corepack pnpm lint
corepack pnpm build
corepack pnpm check:architecture
corepack pnpm test:architecture
corepack pnpm test:barcode
corepack pnpm test:barcode:workspace
corepack pnpm test:company:monetary-policy:web
```

Si algo ya falla en la base, documentarlo y no atribuirlo a este cambio.

## Fase 1 — Marcador `server-only` en composition roots de Web (H2)

**Rol:** `backend_engineer`

**Resultado:** cualquier intento de llevar un composition root con adaptadores
o secretos al grafo cliente rompe `next build`. Esto también protege los imports
transitivos.

**Rutas permitidas:**
- `package.json` raíz (solo agregar la dependencia) y `pnpm-lock.yaml`
- `src/client-api/v1/**`
- `src/modules/*/backend/infra/**`
- `src/modules/security/backend/web-security.ts`
- `src/shared/backend/**` (solo archivos que instancian adaptadores)
- scripts `test:*` del `package.json` raíz, solo si el punto 4 lo exige

**Exclusiones:** `packages/**`, `apps/**`, `app/(app)/**`, `src/**/frontend/**`.

**Pasos:**
1. Agregar `"server-only": "0.0.1"` a `dependencies` de la raíz (ya está en el
   lockfile como transitiva) con `corepack pnpm add server-only@0.0.1 -w`.
2. Agregar `import "server-only";` como primera línea de:
   - todo módulo de `src/client-api/v1/**` que importe `@kontave/*/supabase`,
     `@kontave/*/postgres`, `@kontave/*/adapters/*`, `@kontave/monetary/monitor-bcv`,
     o lea `SUPABASE_SERVICE_ROLE_KEY`;
   - cada `src/modules/*/backend/infra/*-factory.ts`;
   - `src/modules/security/backend/web-security.ts`.
   Antes de marcar un archivo DTO o helper puro (`*-dto.ts`, `http/response.ts`),
   comprobar con grep si algún archivo `"use client"` lo importa. Si lo importa,
   **no** marcarlo.
3. Agregar un comentario de una línea en el primer archivo marcado de cada
   carpeta, explicando que el marcador impide filtrar adaptadores con service
   role al bundle cliente. No repetirlo en cada archivo.
4. Ejecutar los scripts `test:*` de la Fase 0. Si un test con `tsx` falla con
   `This module cannot be imported from a Client Component module`:
   - opción preferida: agregar `--conditions=react-server` a ese script y
     confirmar que pasa;
   - si eso rompe otros imports del test, mockear `server-only` con
     `mock.module` (los scripts ya usan `--experimental-test-module-mocks`).
   No quitar el marcador del módulo de producción para que pase un test.

**Aceptación:**
- `corepack pnpm build` pasa.
- Prueba negativa manual, sin commit: importar temporalmente
  `src/client-api/v1/employees/employee-actions.ts` desde un componente
  `"use client"` hace fallar `next build`. Revertir la prueba.
- `grep -rL "server-only" $(grep -rlE "@kontave/[a-z0-9-]+/(supabase|postgres)" src/client-api src/modules/*/backend/infra)`
  devuelve vacío, salvo excepciones justificadas en el resumen.

## Fase 2 — Reglas ESLint de frontera (H2, H4)

**Rol:** `web_engineer` (puede correr en paralelo con la Fase 1; no comparten
archivos)

**Rutas permitidas:** `eslint.config.mjs` únicamente.

**Contrato de la regla (`no-restricted-imports`, nivel `error`):**

| Bloque | `files` | `ignores` | Patrones prohibidos |
|---|---|---|---|
| Superficie cliente | `app/**/*.tsx`, `src/**/frontend/**/*.{ts,tsx}`, `src/shared/frontend/**/*.{ts,tsx}` | `app/api/**` | `@kontave/*/supabase`, `@kontave/*/postgres`, `@kontave/*/adapters/*`, `@kontave/*/node`, `@kontave/monetary/monitor-bcv`, `@/src/client-api/**`, `@/src/modules/*/backend/**`, `@/src/shared/backend/**`, `server-only` |
| Producción Web | `app/**/*.{ts,tsx}`, `src/**/*.{ts,tsx}`, `middleware.ts`, `instrumentation.ts` | `**/*.test.{ts,tsx}`, `test/**` | `@kontave/*/testing` |

**Notas de implementación:**
- En flat config, un bloque posterior que configure la misma regla reemplaza al
  anterior para los archivos que coinciden. Definir los patrones como constantes
  y, en el bloque de superficie cliente, incluir también los patrones de
  `/testing` (salvo en tests) para que una regla no anule a la otra. Verificar
  con `npx eslint --print-config <archivo>` en un `.tsx` cliente y en un test de
  `src/modules/sales/frontend/fiscal/`.
- Mensajes en español y accionables. Por ejemplo: «Los adaptadores de
  infraestructura solo se importan desde app/api o src/**/backend; exponga los
  datos mediante una ruta API».
- Comprobar con `grep -rl '"use client"' app src` que ningún componente cliente
  queda fuera de los globs. Si aparece alguno, ampliar los globs, no crear una
  excepción.
- No tocar la regla `no-restricted-syntax` existente (extensiones `.js`).

**Aceptación:**
- `corepack pnpm lint` pasa sin nuevas desactivaciones (`eslint-disable`).
- Prueba negativa manual, sin commit: agregar
  `import { createEmployeeInfrastructure } from "@kontave/employees/supabase";`
  en `app/(app)/treasury/page.tsx` produce error de lint. Revertir.
- Agregar `import { fiscalInvoiceFixture } from "@kontave/fiscal/testing";` en un
  archivo no-test produce error, mientras que
  `src/modules/sales/frontend/fiscal/format-fiscal-money.test.ts` sigue limpio.

## Fase 3 — Contrato kernel → treasury (H5)

**Rol:** `backend_engineer`, después de la Fase 1

**Decisión recomendada:** mantener la dependencia, pero hacerla explícita y
verificable. `@kontave/treasury/contracts` contiene los tipos inferidos del
contrato validado que comparten servidor y clientes. Duplicarlo en
`client-contracts` crearía dos fuentes de verdad.

**Rutas permitidas:** `tooling/architecture/src/workspace-rules.mjs`,
`tooling/architecture/test/workspace-rules.test.mjs`,
`packages/kernel/contracts/src/domains/treasury/index.ts`.

**Alcance (revisado el 2026-10-22):** la primera versión aplicaba la regla a
todo `packages/kernel/**`, y eso era incorrecto. Según el ADR 0034, el kernel
coordina capacidades: `@kontave/workspace-context-application` (kernel/workspace)
y `@kontave/client-remote` (kernel/remote) importan legítimamente valores de
`/domain` y `/application` de organizations, companies, modules, access-control,
delegated-access, monetary y operation-context. La regla se limita al paquete
de contratos de transporte, `@kontave/client-contracts` (kernel/contracts), que
hoy solo depende de `@kontave/treasury/contracts`.

**Pasos:**
1. Revisar cómo trata hoy `workspace-rules.mjs` las dependencias de
   `@kontave/client-contracts` (mensaje «imports consumer or business dependency»).
2. Agregar una regla limitada a `packages/kernel/contracts/**`: puede importar
   otros workspaces `@kontave/*` **solo** desde una subruta `/contracts` y solo
   con `import type` / `export type`. Cualquier otro import de `@kontave/*` es un
   error. Los demás paquetes del kernel no cambian.
3. Agregar pruebas en `workspace-rules.test.mjs`:
   - válido: `client-contracts` con `import type` desde `/contracts`;
   - inválido: `client-contracts` con import de valor desde `/contracts`;
   - inválido: `client-contracts` con import desde `/domain`;
   - válido (regresión): un archivo de `kernel/workspace` con import de valor
     desde `@kontave/organizations/application`.
4. Agregar un comentario de intención en
   `packages/kernel/contracts/src/domains/treasury/index.ts` que remita al ADR
   nuevo de la Fase 4.

**Aceptación:** `corepack pnpm check:architecture` y
`corepack pnpm --filter @kontave/architecture test` pasan, con las pruebas nuevas
incluidas.

Si la regla limitada rompe algún archivo real de `packages/kernel/contracts/**`,
Codex debe detenerse y reportarlo; no debe ampliar la excepción por su cuenta.

## Fase 4 — Documentación (H1, H3, H4, H5)

**Rol:** `documentation_engineer`, cuando las Fases 1–3 estén estables

**Rutas permitidas:** `AGENTS.md`, `docs/adr/0005-web-production-freeze.md`,
`docs/adr/0044-web-client-server-package-boundary.md` (nuevo),
`docs/standards/architecture.md`, `packages/README.md`.

**Pasos:**
1. **ADR 0044** «Frontera cliente/servidor de la Web sobre paquetes»: estado
   aceptado y fecha. Debe recoger:
   - los composition roots marcados con `server-only` y por qué el marcador no
     va dentro de `packages/**` (consumidores Desktop/Mobile);
   - las reglas ESLint de la Fase 2 tal como quedaron (ver «Estado de
     ejecución»): en `app/` solo se restringen los archivos con `"use client"`,
     porque `app/` mezcla Server y Client Components; en `src/**/frontend/**`
     se permiten `import type` y `backend/domain` del código antiguo;
   - que `/testing` no se usa en producción;
   - la regla tipada `client-contracts` → `/contracts` de la Fase 3, y que el
     resto del kernel puede coordinar capacidades y negocio (ADR 0034);
   - H3: las dependencias en `package.json` son por paquete, no por capa; la
     portabilidad la garantiza `tooling/architecture`, no el manifiesto.
2. **ADR 0005:** cambiar el estado a «Reemplazado parcialmente por ADR 0039»,
   con una línea que explique que la migración por contexto ya terminó. No
   reescribir el historial de la decisión.
3. **`AGENTS.md`, sección «Production Web freeze»:** sustituir la viñeta «Do not
   make the production Web depend on new workspace packages…» por la regla
   vigente. La Web consume paquetes por su nombre público. Los adaptadores
   (`/supabase`, `/postgres`, `/adapters/*`) solo se importan desde `app/api/**`,
   `src/client-api/**` o `src/**/backend/**`. Los composition roots llevan
   `server-only`. Conservar las demás viñetas (no mover directorios, cambios de
   API/BD aditivos).
4. **`docs/standards/architecture.md`:** agregar una sección corta «Consumo de
   paquetes desde la Web» que enlace al ADR 0044.
5. **`packages/README.md`:** añadir una regla 11 sobre `/testing` (solo tests) y
   una nota sobre H3.

**Aceptación:** los enlaces relativos resuelven, no se contradice el ADR 0039 y
la documentación no cambia comportamiento.

## Orden y paralelismo

```
Fase 0 (principal)
   ├── Fase 1 (backend_engineer) ──► Fase 3 (backend_engineer)
   └── Fase 2 (web_engineer)
                    └──────────────► Fase 4 (documentation_engineer)
                                         └► Integración final (principal)
```

Un solo escritor por archivo: `package.json`/lockfile en la Fase 1,
`eslint.config.mjs` en la Fase 2, `tooling/architecture/**` en la Fase 3 y la
documentación en la Fase 4.

## Validación final (agente principal)

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm build
corepack pnpm check:architecture
corepack pnpm test:architecture
corepack pnpm test:barcode
corepack pnpm test:barcode:workspace
corepack pnpm test:company:monetary-policy:web
corepack pnpm --filter @kontave/desktop run typecheck
corepack pnpm --filter @kontave/mobile run check
```

Desktop y Mobile se validan para confirmar que no se tocó `packages/**` de forma
que afecte a los consumidores nativos.

## Entregables del resumen de Codex

- Lista de archivos marcados con `server-only` y archivos excluidos con su
  motivo.
- Evidencia de las tres pruebas negativas (build, ESLint de adaptador, ESLint de
  `/testing`) ya revertidas.
- Diferencias con la línea base de la Fase 0.
- Commits separados por fase, con mensajes convencionales (`build(web): …`,
  `chore(lint): …`, `test(architecture): …`, `docs(adr): …`).

## Estado de ejecución (2026-10-22)

| Fase | Estado | Notas |
|---|---|---|
| 0 | Hecha | En el entorno de Codex fallaban lint, build y tests por EPERM en `node_modules`; en Windows con `corepack pnpm` sí se pueden ejecutar. |
| 1 | Hecha | 55 módulos con `import "server-only"` (`src/client-api/v1/**`, factories de `backend/infra`, `web-security.ts`); ningún composition root con adaptadores o service role queda sin marcar. `test:barcode` ahora usa `node --conditions=react-server` porque `barcode-request-guard.test.ts` alcanza un módulo marcado. |
| 2 | Hecha, con corrección | La primera versión de Codex no aplicaba la regla de adaptadores en ningún archivo cliente, porque el bloque de `/testing`, posterior, la anulaba. Además habría marcado como error los `import type` y los imports de `backend/domain` del código antiguo, y también los Server Components de `app/`. Versión final: `@typescript-eslint/no-restricted-imports` con `allowTypeImports` y regex `backend/(?!domain/)` en `src/**/frontend/**`, más un selector `no-restricted-syntax` limitado a archivos `"use client"` de cualquier ruta. |
| 3 | Hecha | Regla limitada a `@kontave/client-contracts` en `workspace-rules.mjs`; 17/17 pruebas de `@kontave/architecture`, con la regresión de `kernel/workspace` incluida. `audit-routes.mjs` también usa `--conditions=react-server`. |
| 4 | Hecha | ADR 0044 nuevo; ADR 0005, `AGENTS.md`, `docs/standards/architecture.md` y `packages/README.md` actualizados. En el ADR se precisó qué cubre el build y qué cubre ESLint. |

Validación tras las Fases 3 y 4: `pnpm lint` pasa (0 errores, 327 avisos ya
existentes; el auditor clasificó 99 páginas, 88 entradas de navegación y 208
handlers) y `check:architecture` pasa. En `test:architecture` solo fallan las 7
pruebas nativas de `packages/ui` (`useContext` sobre null, dos instancias de
React); `pnpm` se detiene ahí. Con `--no-bail`, 45 workspaces pasan y fallan
tres, ninguno tocado por este trabajo:
- `packages/ui`: lo descrito arriba; sus enlaces en `node_modules` son del
  2026-09-22.
- `packages/business/sales`: «WebCrypto rejects tampered ciphertext, keyed
  tags, and missing key versions» (`Missing expected rejection`).
- `apps/desktop`: `desktop-secure-storage.test.ts` no puede cargar Electron
  («Electron failed to install correctly»); es un problema del entorno.

Evidencia de la verificación:
- `npx eslint .`: 0 errores (327 avisos ya existentes, ninguno de estas reglas).
- Pruebas de ESLint por stdin, 9 de 9 con el resultado esperado: adaptador en `"use client"`, `client-api` en `"use client"`, `backend/infra` en `frontend` y `/testing` en una ruta y en `frontend` fallan; Server Component con backend, `import type`, `backend/domain` y `/testing` en un test pasan.
- `corepack pnpm build`: pasa. Con una página temporal `"use client"` que importa `employee-actions.ts`, falla con «You're importing a component that needs "server-only"». La página ya se eliminó.
- `check:architecture`, `test:barcode` (64/64), `test:barcode:workspace` (12/12) y `test:company:monetary-policy:web` (3/3) pasan.
- `pnpm install` también sincronizó en el lockfile dependencias de `packages/business/payroll` que ya estaban declaradas en su manifiesto (desajuste previo a este trabajo).
