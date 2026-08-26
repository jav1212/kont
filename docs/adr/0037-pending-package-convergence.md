# ADR 0037: Convergencia pendiente de paquetes y restricción de producción

- Estado: propuesto
- Fecha: 2026-08-26

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

## Deuda abierta en UI

`packages/ui/` contiene actualmente cinco unidades:

- `@kontave/brand-assets`
- `@kontave/ui-contracts`
- `@kontave/design-tokens`
- `@kontave/ui-dom`
- `@kontave/ui-native`

`ui-dom` depende de React DOM y es consumido por Desktop. `ui-native` depende
de React Native y es consumido por Mobile. Esta diferencia de runtime es real,
pero el término `native` no debe actuar como clasificación de dominio ni
propagarse a contratos, casos de uso o capacidades portables.

La siguiente fase debe auditar esta distribución y decidir con evidencia entre:

1. un paquete `@kontave/ui` con contratos, tokens y adaptadores expuestos por
   subpaths; o
2. paquetes de adaptador separados cuando React DOM y React Native demuestren
   dependencias, bundling o ciclos de entrega incompatibles.

En ambos casos deben cumplirse estas condiciones:

- contratos y tokens no se duplican por plataforma;
- ningún contrato portable usa `native` para distinguir clientes;
- una dependencia de React Native sólo existe en el adaptador que la necesita;
- `brand-assets` puede conservar distribución propia si el empaquetado de
  recursos no código lo requiere;
- Desktop y Mobile consumen APIs explícitas sin imports internos del paquete.

Este ADR no decide todavía si los adaptadores UI comparten manifest. Esa
decisión requiere comprobar el comportamiento de Metro, Electron/Vite, peer
dependencies y tree-shaking antes de modificar la topología.

## Decisión propuesta

Mientras la aplicación Web permanezca fuera del alcance del refactor:

1. No se renombrarán ni eliminarán los paquetes consumidos directamente por
   el `package.json`, `app/` o `src/` de producción.
2. No se crearán wrappers de compatibilidad permanentes para aparentar una
   consolidación incompleta.
3. Se permiten mejoras internas compatibles dentro de `packages/`: TSDoc,
   errores esperados tipados, imports TypeScript extensionless, pruebas y
   refuerzo de las dependencias hacia dentro.
4. El siguiente corte seguro será la auditoría y resolución de la distribución
   UI, porque sus consumidores están en Desktop y Mobile y no exige modificar
   el Web de producción.
5. La convergencia de cada uno de los 17 contextos diferidos requerirá una
   tarea explícita que autorice la migración del Web.

## Secuencia de trabajo pendiente

### Fase 1: UI portable y adaptadores

- Medir las fronteras reales de dependencias y bundling.
- Retirar `native` del lenguaje portable.
- Consolidar contratos y tokens donde no exista una frontera de distribución.
- Migrar Desktop y Mobile en el mismo corte.
- Validar Metro, Electron/Vite, TypeScript, ESLint y pruebas de arquitectura.

### Fase 2: endurecimiento sin cambios públicos

- Completar TSDoc API-grade en los contextos diferidos.
- Tipar errores esperados y eliminar excepciones genéricas en fronteras
  públicas.
- Verificar que dominio y aplicación no importen SDKs, UI ni adaptadores.
- Incorporar checks de duplicación de nombres y dependencias entre apps.

### Fase 3: migración explícita del Web

Cuando exista autorización para tocar producción, cada contexto se migrará de
forma atómica:

1. crear el paquete unificado y sus subpath exports;
2. mover domain, application, adapters y testing a módulos internos;
3. migrar packages, apps y Web al nuevo API público;
4. retirar todos los workspaces y nombres anteriores en el mismo cambio;
5. actualizar el lockfile;
6. ejecutar build Web, validaciones de consumidores y gates globales.

No se iniciará una segunda migración de contexto hasta cerrar las referencias
heredadas de la anterior.

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

- La deuda restante queda cuantificada y no se confunde con trabajo seguro para
  la fase actual.
- El freeze de producción deja de ser una expresión ambigua: bloquea cambios en
  consumidores Web, no mejoras internas compatibles de los paquetes.
- UI se convierte en el siguiente punto de decisión arquitectónica.
- La reducción potencial de manifests queda visible, pero no se obtiene a costa
  de compatibilidad oculta o duplicación temporal permanente.
