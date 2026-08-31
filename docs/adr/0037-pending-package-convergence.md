# ADR 0037: Convergencia pendiente de paquetes y restricción de producción

- Estado: aceptado
- Fecha: 2026-08-26
- Resultado de fase 3: completado el 2026-08-31 por el ADR 0039

## Contexto

El ADR 0035 estableció que la unidad predeterminada de distribución es el
bounded context o una capacidad arquitectónica con consumidores reales. Las
capas `domain`, `application`, `adapters` y `testing` deben ser módulos internos
del paquete y no workspaces independientes salvo que exista una frontera
demostrable de runtime, seguridad, propiedad o ciclo de entrega.

La primera etapa de convergencia consolidó `fiscal`, `payroll`, `feedback`,
`interaction`, `settings`, `connectivity`, `devices`, `observability` y
`updates`. También retiró las carpetas de capa innecesarias de `navigation` e
`history`. El repositorio queda, al momento de este ADR, con 98 manifests bajo
`packages/` y 102 proyectos en el workspace.

La aplicación Next.js ubicada en `app/`, `src/` y `public/` permanece en
producción. Su `package.json` raíz declara directamente 60 paquetes
`@kontave/*`; 59 de ellos tienen imports observables en `app/` o `src/`. El
refactor de la arquitectura portable no está autorizado a modificar esas
rutas ni a cambiar sus dependencias mientras continúe esta restricción.

Por esta razón, la fragmentación restante no puede resolverse sustituyendo
nombres públicos de forma aislada: eliminar cualquiera de esos workspaces sin
migrar sus consumidores rompería la aplicación de producción.

## Inventario de convergencia pendiente

Los siguientes contextos todavía distribuyen sus capas como workspaces
independientes:

| Contexto | Manifests actuales | Relación con producción |
| --- | ---: | --- |
| `operation-context` | 3 | Dependencia directa |
| `experience/preferences` | 4 | Dependencia directa |
| `monetary` | 4 | Dependencia directa |
| `portal-monitoring` | 4 | Dependencia directa |
| `business/billing` | 5 | Dependencia directa |
| `business/documents` | 3 | Dependencia directa |
| `business/employees` | 5 | Dependencia directa |
| `business/inventory` | 4 | Dependencia directa |
| `business/modules` | 5 | Dependencia directa |
| `business/payments` | 4 | Dependencia directa |
| `business/pricing` | 4 | Dependencia directa |
| `business/products` | 4 | Dependencia directa |
| `business/purchasing` | 5 | Application y Supabase son dependencias directas |
| `business/referrals` | 4 | Dependencia directa |
| `business/sales` | 5 | Application y Supabase son dependencias directas |
| `business/taxation` | 6 | Dependencia directa |
| `business/unit-economics` | 3 | Application y Supabase son dependencias directas |

Estos 17 contextos suman 72 manifests. Su convergencia a un paquete por
contexto retiraría 55 manifests, antes de considerar cualquier cambio en UI.

Los paquetes `testing` de estos contextos no justifican por sí solos una
unidad de distribución. Deben converger junto con su contexto propietario, no
mediante una migración parcial que mantenga indefinidamente el resto de las
capas separadas.

## Resolución de la deuda UI

El ADR 0038 resolvió este corte con cuatro unidades:

- `@kontave/brand-assets`
- `@kontave/ui`
- `@kontave/ui-dom`
- `@kontave/ui-react-native`

`ui-dom` depende de React DOM y es consumido por Desktop. `ui-react-native`
depende de React Native y es consumido por Mobile. Los contratos y tokens
convergieron en `@kontave/ui`; el efecto `applyDesignTokens` pasó al adaptador
DOM para que el núcleo portable no dependa de `HTMLElement`.

La auditoría demostró peer dependencies, bundlers y ciclos de entrega distintos
entre Electron/Vite y Expo/Metro. Por ello los adaptadores conservan manifests
separados y el núcleo portable converge en `@kontave/ui`.

La solución cumple estas condiciones:

- contratos y tokens no se duplican por plataforma;
- ningún contrato portable usa `native` para distinguir clientes;
- una dependencia de React Native sólo existe en el adaptador que la necesita;
- `brand-assets` puede conservar distribución propia si el empaquetado de
  recursos no código lo requiere;
- Desktop y Mobile consumen APIs explícitas sin imports internos del paquete.

La decisión completa y su evidencia se registran en el ADR 0038.

## Decisión

Mientras la aplicación Web permanezca fuera del alcance del refactor:

1. No se renombrarán ni eliminarán los paquetes consumidos directamente por
   el `package.json`, `app/` o `src/` de producción.
2. No se crearán wrappers de compatibilidad permanentes para aparentar una
   consolidación incompleta.
3. Se permiten mejoras internas compatibles dentro de `packages/`: TSDoc,
   errores esperados tipados, imports TypeScript extensionless, pruebas y
   refuerzo de las dependencias hacia dentro.
4. La distribución UI se resolvió en el ADR 0038 sin modificar el Web de
   producción.
5. La convergencia de cada uno de los 17 contextos diferidos requerirá una
   tarea explícita que autorice la migración del Web.

## Secuencia de trabajo pendiente

### Fase 1 completada: UI portable y adaptadores

- Se midieron las fronteras reales de dependencias y bundling.
- Se retiró `native` del lenguaje portable.
- Se consolidaron contratos y tokens en `@kontave/ui`.
- Desktop y Mobile migraron en el mismo corte.
- Metro, Electron/Vite, TypeScript, ESLint y las pruebas de arquitectura forman
  parte de los gates del corte.

### Fase 2: endurecimiento sin cambios públicos

- Completar TSDoc API-grade en los contextos diferidos.
- Tipar errores esperados y eliminar excepciones genéricas en fronteras
  públicas.
- Verificar que dominio y aplicación no importen SDKs, UI ni adaptadores.
- Incorporar checks de duplicación de nombres y dependencias entre apps.

#### Progreso

| Contexto | Estado | Evidencia principal |
| --- | --- | --- |
| `operation-context` | Completado | Errores de coordinador y Supabase tipados; 15 pruebas focalizadas |
| `experience/preferences` | Completado | Fronteras de aplicación y Supabase tipadas; 9 pruebas focalizadas |
| `portal-monitoring` | Completado | Fallos de repositorio normalizados; 6 pruebas focalizadas |
| `business/unit-economics` | Completado | Fuentes formateadas, RPC tipado y 6 pruebas focalizadas |
| `business/pricing` | Completado | Dominio y casos de uso documentados; errores de repositorio tipados |
| `business/documents` | Completado | Contratos documentados; errores de repositorio y almacenamiento tipados; 6 pruebas focalizadas |
| `business/employees` | Completado | Agregado, puertos y Supabase documentados; fechas y errores de repositorio validados; 2 pruebas focalizadas |
| `business/payments` | Completado | Contratos, casos de uso, Supabase y dobles documentados; errores de repositorio tipados; 2 pruebas focalizadas |
| `monetary` | Completado | Dominio exacto y resolución documentados; caché y proveedor BCV tipados; 22 pruebas focalizadas |
| `business/billing` | Completado | Puertos y casos de uso documentados; repositorio, ledger y almacenamiento tipados; 9 pruebas focalizadas |
| `business/modules` | Completado | Dominio, puertos y casos de uso documentados; fallos de fronteras normalizados; 5 pruebas focalizadas |
| `business/products` | Completado | Casos de uso y operaciones de dominio documentados; RPC y repositorio tipados; 3 pruebas focalizadas |
| `business/referrals` | Completado | Dominio, puertos y casos de uso documentados; crédito anticorrupción y errores tipados; 4 pruebas focalizadas |
| `business/taxation` | Completado | Dominio temporal y fiscal documentado; aplicación y Supabase formateados y tipados; 2 pruebas focalizadas |
| `business/inventory` | Completado | Dominio, dashboard, operaciones y Supabase documentados y formateados; errores de frontera tipados; 22 pruebas focalizadas |
| `business/purchasing` | Completado | Dominio, casos de uso, integración con inventario y Supabase documentados; errores de frontera tipados; 19 pruebas focalizadas |
| `business/sales` | Completado | Dominio, casos de uso, integración con inventario y Supabase documentados; errores de frontera tipados; 16 pruebas focalizadas |

Estos cortes conservan todos los nombres públicos existentes. Los 17 contextos
diferidos completaron el endurecimiento compatible de la fase 2 sin modificar
los consumidores Web congelados. La fase 3 permanece condicionada a una
autorización explícita para migrar producción.

### Fase 3: migración explícita del Web

El plan de ejecución, orden, gates y estrategia de rollback de esta fase se
definen en el ADR 0039.

La fase 3 se completó el 2026-08-31. Los 17 contextos convergieron a una unidad
de distribución cada uno, se retiraron los 55 manifests de capa previstos y el
workspace pasó de 102 a 47 proyectos. Web, Desktop y Mobile compilan con el
grafo definitivo; la instalación congelada, los gates globales y las pruebas
focalizadas quedaron aprobados. El detalle por corte y sus superficies públicas
finales permanece registrado en el ADR 0039.

La ejecución aplicó de forma atómica en cada contexto:

1. crear el paquete unificado y sus subpath exports;
2. mover domain, application, adapters y testing a módulos internos;
3. migrar packages, apps y Web al nuevo API público;
4. retirar todos los workspaces y nombres anteriores en el mismo cambio;
5. actualizar el lockfile;
6. ejecutar build Web, validaciones de consumidores y gates globales.

Cada migración cerró sus referencias heredadas antes de iniciar la siguiente.

## Criterios de aceptación

Cada corte de convergencia debe demostrar:

- cero modificaciones no autorizadas en `app/`, `src/`, `public/` y el
  `package.json` raíz;
- cero imports hacia `apps/` desde `packages/`;
- cero imports entre aplicaciones;
- dependencias de dominio y aplicación apuntando hacia dentro;
- cero nombres públicos heredados tras una migración autorizada;
- cero nombres de paquetes duplicados;
- instalación con lockfile congelado;
- TypeScript, ESLint, pruebas focalizadas y gates globales aprobados;
- build de cada consumidor modificado.

## Consecuencias

- La deuda de distribución cuantificada por este ADR quedó retirada por el ADR
  0039.
- El freeze de producción deja de ser una expresión ambigua: bloquea cambios en
  consumidores Web, no mejoras internas compatibles de los paquetes.
- UI se convierte en el siguiente punto de decisión arquitectónica.
- La reducción potencial de manifests queda visible, pero no se obtiene a costa
  de compatibilidad oculta o duplicación temporal permanente.
