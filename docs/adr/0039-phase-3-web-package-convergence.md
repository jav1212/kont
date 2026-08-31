# ADR 0039: Fase 3 de convergencia de paquetes y migración Web

- Estado: aceptado
- Fecha: 2026-08-29

## Contexto

El ADR 0037 cuantificó 17 contextos cuyas capas `domain`, `application`,
adaptadores y `testing` continúan publicándose como workspaces independientes.
La fase 2 endureció esos límites sin cambiar sus nombres públicos ni modificar
la aplicación Web de producción.

El ADR 0038 resolvió por separado la arquitectura UI portable. Los clientes
Desktop y Mobile ya consumen un núcleo compartido y adaptadores explícitos por
renderer. Esa decisión no autoriza por sí sola a migrar los imports del Web.

La fase 3 requiere modificar `app/`, `src/`, el `package.json` raíz y el
lockfile. Por tanto, deja de aplicar el freeze temporal únicamente para el
contexto que se encuentre en migración y durante un corte explícitamente
autorizado.

## Objetivo

Converger cada bounded context a una sola unidad de distribución sin mantener
wrappers permanentes, nombres duplicados ni dependencias desde las capas
portables hacia infraestructura o frameworks.

Al completar la fase:

- cada contexto tendrá un único paquete propietario;
- `domain`, `application`, adaptadores y `testing` serán módulos internos o
  subpath exports justificados;
- todos los consumidores usarán exclusivamente el nuevo API público;
- los workspaces y nombres heredados desaparecerán en el mismo corte;
- el Web, Desktop y Mobile conservarán comportamiento observable compatible.

## Decisión propuesta

La migración se realizará un contexto a la vez. Cada contexto constituye un
corte atómico e independiente que debe terminar completamente antes de iniciar
el siguiente.

Un corte incluye obligatoriamente:

1. crear o seleccionar el paquete unificado propietario;
2. mover las capas actuales a módulos internos con dependencias hacia dentro;
3. definir los subpath exports estrictamente necesarios;
4. migrar imports y dependencias en paquetes, aplicaciones y Web;
5. retirar manifests, exports y nombres heredados en el mismo cambio;
6. actualizar el lockfile con instalación congelada reproducible;
7. ejecutar pruebas focalizadas, TypeScript, ESLint, arquitectura y builds de
   todos los consumidores afectados;
8. confirmar que no quedan referencias al API retirado antes de integrar el
   corte.

No se crearán paquetes puente para sostener dos APIs en paralelo. Si un corte
no puede completarse, se revierte completo y el nombre anterior permanece como
única API pública.

## Orden de migración

El orden reduce primero fronteras pequeñas y con menor superficie de runtime,
deja las capacidades monetarias y comerciales para cuando sus dependencias ya
sean estables, y reserva los flujos transaccionales más amplios para el final.

### Bloque 1: contexto operativo y experiencia

1. `operation-context`
2. `experience/preferences`
3. `portal-monitoring`
4. `business/unit-economics`

### Bloque 2: capacidades administrativas

5. `business/pricing`
6. `business/documents`
7. `business/employees`
8. `business/payments`

### Bloque 3: capacidades comerciales medianas

9. `monetary`
10. `business/billing`
11. `business/modules`
12. `business/products`
13. `business/referrals`
14. `business/taxation`

### Bloque 4: flujos transaccionales

15. `business/inventory`
16. `business/purchasing`
17. `business/sales`

El orden dentro de un bloque puede cambiar únicamente si la auditoría del
primer corte demuestra una dependencia real que haga más seguro invertir dos
contextos. Ese cambio debe registrarse en el ADR antes de ejecutar la
migración afectada.

## Progreso de ejecución

| Corte | Estado | Evidencia principal |
| --- | --- | --- |
| `operation-context` | Completado | Un solo workspace `@kontave/operation-context`; Web y Desktop migrados; 15 pruebas focalizadas |
| `experience/preferences` | Completado | Un solo workspace `@kontave/preferences`; Web migrado; 9 pruebas focalizadas |
| `portal-monitoring` | Completado | Un solo workspace `@kontave/portal-monitoring`; Web migrado; 6 pruebas focalizadas |
| `business/unit-economics` | Completado | Un solo workspace `@kontave/unit-economics`; Web migrado; 6 pruebas focalizadas |
| `business/pricing` | Completado | Un solo workspace `@kontave/pricing`; Web migrado; 5 pruebas focalizadas |
| `business/documents` | Completado | Un solo workspace `@kontave/documents`; Web migrado; 6 pruebas focalizadas |
| `business/employees` | Completado | Un solo workspace `@kontave/employees`; Web y Payroll migrados; 2 pruebas focalizadas y 27 del consumidor |
| `business/payments` | Completado | Un solo workspace `@kontave/payments`; Web y Billing orchestration migrados; 2 pruebas focalizadas y 1 del consumidor |
| `monetary` | Completado | Un solo workspace `@kontave/monetary`; Web, Desktop y paquetes comerciales migrados; 20 pruebas focalizadas |
| `business/billing` | Completado | Un solo workspace `@kontave/billing`; Web, Payments y Referrals migrados; 10 pruebas focalizadas |
| `business/modules` | Completado | Un solo workspace `@kontave/modules`; Web, Desktop, Mobile y Workspace migrados; 9 pruebas focalizadas |
| `business/products` | Completado | Un solo workspace `@kontave/products`; Web y contextos comerciales migrados; 8 pruebas focalizadas |
| `business/referrals` | Completado | Un solo workspace `@kontave/referrals`; Web y Payments migrados; 6 pruebas focalizadas |
| `business/taxation` | Completado | Un solo workspace `@kontave/taxation`; Web y Fiscal migrados; 18 pruebas focalizadas |
| `business/inventory` | Completado | Un solo workspace `@kontave/inventory`; Web, Purchasing y Sales migrados; 23 pruebas focalizadas y 5 de integración |
| `business/purchasing` | Completado | Un solo workspace `@kontave/purchasing`; Web e Inventory migrados; 19 pruebas focalizadas |
| `business/sales` | Completado | Un solo workspace `@kontave/sales`; Web e Inventory migrados; 16 pruebas focalizadas |
| 17 contextos | Completado | Fase 3 cerrada; 55 manifests de capa retirados y 47 proyectos finales en el workspace |

El primer corte retiró conjuntamente los nombres `@kontave/operation-context-domain`,
`@kontave/operation-context-application` y
`@kontave/operation-context-supabase`. El nuevo paquete publica las superficies
`/domain`, `/application` y `/supabase`; su export raíz contiene únicamente las
capas portables de dominio y aplicación.

El segundo corte retiró `@kontave/preferences-domain`,
`@kontave/preferences-application`, `@kontave/preferences-supabase` y
`@kontave/preferences-testing`. El paquete `@kontave/preferences` publica
`/domain`, `/application` y `/supabase`; los dobles de prueba permanecen como
módulo interno porque no existe un consumidor que justifique otro subpath.

El tercer corte retiró `@kontave/portal-monitoring-domain`,
`@kontave/portal-monitoring-application`,
`@kontave/portal-monitoring-supabase` y
`@kontave/portal-monitoring-testing`. Su paquete unificado conserva los
subpaths `/domain`, `/application` y `/supabase`; los dobles sin consumidores
permanecen internos.

El cuarto corte retiró `@kontave/unit-economics-application`,
`@kontave/unit-economics-supabase` y `@kontave/unit-economics-testing`. El
paquete `@kontave/unit-economics` publica el contrato de aplicación desde el
root y `/application`, y su adaptador desde `/supabase`; las fixtures sin
consumidores externos permanecen internas. Con este corte termina el bloque 1.

El quinto corte retiró `@kontave/pricing-domain`,
`@kontave/pricing-application`, `@kontave/pricing-supabase` y
`@kontave/pricing-testing`. El paquete `@kontave/pricing` publica las
superficies portables desde el root, `/domain` y `/application`, y su adaptador
desde `/supabase`; los dobles de prueba sin consumidores externos permanecen
internos.

El sexto corte retiró `@kontave/documents-domain`,
`@kontave/documents-application` y `@kontave/documents-supabase`. El paquete
`@kontave/documents` publica las superficies portables desde el root, `/domain`
y `/application`, y mantiene el adaptador de infraestructura aislado en
`/supabase`.

El séptimo corte retiró `@kontave/employees-domain`,
`@kontave/employees-application`, `@kontave/employees-contracts`,
`@kontave/employees-supabase` y `@kontave/employees-testing`. El paquete
`@kontave/employees` publica el root portable y los subpaths `/domain`,
`/application`, `/contracts` y `/supabase`; el repositorio en memoria sin
consumidores externos permanece interno.

El octavo corte retiró `@kontave/payments-domain`,
`@kontave/payments-application`, `@kontave/payments-supabase` y
`@kontave/payments-testing`. El paquete `@kontave/payments` publica el root
portable y los subpaths `/domain`, `/application` y `/supabase`; los dobles de
prueba sin consumidores externos permanecen internos. Con este corte termina
el bloque 2.

El noveno corte retiró `@kontave/monetary-domain`,
`@kontave/monetary-application`, `@kontave/monetary-monitor-bcv-adapter` y
`@kontave/monetary-testing`. El paquete `@kontave/monetary` publica el root
portable, `/domain`, `/application` y el adaptador `/monitor-bcv`; las fixtures
sin consumidores externos permanecen internas. Web, Desktop y los contextos
comerciales consumen ahora esta única identidad de workspace.

El décimo corte retiró `@kontave/billing-domain`,
`@kontave/billing-application`, `@kontave/billing-orchestration`,
`@kontave/billing-supabase` y `@kontave/billing-testing`. El paquete
`@kontave/billing` publica el root portable y los subpaths `/domain`,
`/application`, `/orchestration` y `/supabase`; los dobles sin consumidores
externos permanecen internos. Orchestration define puertos estructurales para
Payments y Referrals, evitando ciclos de workspace entre los tres contextos.

El undécimo corte retiró `@kontave/modules-domain`,
`@kontave/modules-application`, `@kontave/modules-contracts`,
`@kontave/modules-supabase` y `@kontave/modules-testing`. El paquete
`@kontave/modules` publica el root portable y los subpaths `/domain`,
`/application`, `/contracts` y `/supabase`; los dobles de prueba sin
consumidores externos permanecen internos. Web, Desktop, Mobile y el
coordinador de Workspace consumen ahora esta única identidad.

El duodécimo corte retiró `@kontave/products-domain`,
`@kontave/products-application`, `@kontave/products-supabase` y
`@kontave/products-testing`. El paquete `@kontave/products` publica el root
portable y los subpaths `/domain`, `/application` y `/supabase`; las fixtures
sin consumidores externos permanecen internas. Web, Inventory, Pricing,
Unit Economics, Taxation, Sales y Purchasing comparten ahora una sola
identidad de producto.

El decimotercer corte retiró `@kontave/referrals-domain`,
`@kontave/referrals-application`, `@kontave/referrals-supabase` y
`@kontave/referrals-testing`. El paquete `@kontave/referrals` publica el root
portable y los subpaths `/domain`, `/application` y `/supabase`; el repositorio
en memoria sin consumidores externos permanece interno. Web y la confirmación
de Payments consumen ahora esta única identidad, mientras Billing conserva
puertos estructurales y no introduce un ciclo hacia Referrals.

El decimocuarto corte retiró `@kontave/taxation-domain`,
`@kontave/taxation-application`, `@kontave/taxation-fiscal`,
`@kontave/taxation-venezuela`, `@kontave/taxation-supabase` y
`@kontave/taxation-testing`. El paquete `@kontave/taxation` publica el root
portable y los subpaths `/domain`, `/application`, `/fiscal`, `/venezuela` y
`/supabase`; las fixtures sin consumidores externos permanecen internas. Web
y Fiscal consumen ahora una única identidad sin perder las fronteras explícitas
de las políticas tributarias venezolanas. Con este corte termina el bloque 3.

El decimoquinto corte retiró `@kontave/inventory-domain`,
`@kontave/inventory-application`, `@kontave/inventory-supabase` y
`@kontave/inventory-testing`. El paquete `@kontave/inventory` publica el root
portable y los subpaths `/domain`, `/application` y `/supabase`; las fixtures
sin consumidores externos permanecen internas. Los adaptadores de Purchasing
y Sales dependen únicamente de `/domain`, por lo que los flujos transaccionales
conservan la dirección hacia el núcleo de Inventory.

El decimosexto corte retiró `@kontave/purchasing-domain`,
`@kontave/purchasing-application`, `@kontave/purchasing-inventory`,
`@kontave/purchasing-supabase` y `@kontave/purchasing-testing`. El paquete
`@kontave/purchasing` publica el root portable y los subpaths `/domain`,
`/application`, `/application/dashboard`, `/inventory` y `/supabase`; las
fixtures sin consumidores externos permanecen internas. El posting hacia
Inventory conserva un adaptador explícito y no introduce dependencias de
infraestructura en el dominio de Purchasing.

El decimoséptimo corte retiró `@kontave/sales-domain`,
`@kontave/sales-application`, `@kontave/sales-inventory`,
`@kontave/sales-supabase` y `@kontave/sales-testing`. El paquete
`@kontave/sales` publica el root portable y los subpaths `/domain`,
`/application`, `/inventory` y `/supabase`; las fixtures sin consumidores
externos permanecen internas. El posting hacia Inventory conserva un adaptador
explícito y el dominio comercial permanece independiente de infraestructura.
Con este corte termina el bloque 4 y la convergencia de los 17 contextos.

La instalación congelada, TypeScript global, las pruebas globales de
arquitectura y los builds de consumidores aprobaron los diecisiete cortes. ESLint
aprobó todos los archivos modificados. El lint global conserva un baseline
preexistente de 24 errores y 342 advertencias en archivos no modificados por
estas migraciones; los cortes no incrementan esa deuda.

Después del décimo corte también se retiraron los `node_modules` anidados de
los antiguos sub-workspaces ya eliminados. Eran enlaces regenerables y
obsoletos que formaban un grafo cíclico para el seguimiento de contexto de
webpack; su limpieza restableció el build Web sin alterar dependencias.

Durante el decimoquinto corte el caché incremental `.next` todavía referenciaba
identidades de workspaces retiradas y provocó un fallo interno de Webpack. Se
apartó el artefacto regenerable y el build limpio de producción aprobó sin
cambios adicionales de código.

## Reglas de diseño

- El paquete unificado conserva la propiedad del dominio y de sus puertos.
- Los adaptadores Supabase, HTTP, SQLite o de plataforma implementan puertos;
  nunca definen contratos consumidos por dominio o aplicación.
- Los imports TypeScript permanecen extensionless.
- Los subpath exports expresan límites arquitectónicos; no exponen rutas
  internas por conveniencia.
- Los paquetes nunca importan aplicaciones, y las aplicaciones nunca se
  importan entre sí.
- El Web no accederá a módulos internos del paquete unificado.
- Los errores esperados conservan códigos estables o incluyen una migración
  explícita y probada del contrato.
- Todo API público nuevo o movido conserva TSDoc API-grade.

## Estrategia de compatibilidad

La compatibilidad se garantiza migrando todos los consumidores en el mismo
corte, no manteniendo alias indefinidos.

Antes de retirar un nombre se debe generar un inventario de:

- dependencias declaradas en todos los `package.json`;
- imports estáticos y dinámicos;
- aliases de TypeScript, Vite, Metro, Electron y Next.js;
- mocks, fixtures y configuraciones de pruebas;
- scripts, documentación y ejemplos ejecutables.

El inventario debe quedar en cero para el nombre retirado. Una referencia en
documentación histórica puede conservarse sólo cuando esté claramente marcada
como una decisión anterior y no pueda copiarse como API vigente.

## Persistencia y contratos externos

La convergencia de paquetes no autoriza cambios destructivos de base de datos
ni de APIs externas. Las migraciones SQL deben ser aditivas y compatibles con
la versión desplegada inmediatamente anterior.

Si un contexto necesita cambiar un contrato persistido, dicho cambio se
separa de la convergencia o se implementa mediante lectura dual y escritura
compatible con un plan de retiro independiente.

## Gates por corte

Cada migración debe aprobar:

- instalación con `pnpm install --frozen-lockfile`;
- cero nombres de paquete duplicados;
- cero referencias al nombre heredado retirado;
- TypeScript de todos los proyectos del workspace;
- ESLint de todos los archivos modificados;
- pruebas focalizadas del contexto y sus consumidores;
- `check:architecture` y `test:architecture`;
- build Web de producción;
- build de Desktop o Mobile cuando cambien sus dependencias;
- `git diff --check`;
- revisión explícita de cambios de API, SQL y lockfile.

La deuda de lint preexistente en rutas no modificadas debe registrarse como
baseline. Ningún corte puede aumentar ese baseline ni usarlo para ocultar un
error introducido por la migración.

## Rollback

Cada contexto se integra en un commit o serie de commits que pueda revertirse
sin depender de una migración posterior. El rollback restaura conjuntamente:

- manifests y exports anteriores;
- imports de todos los consumidores;
- lockfile;
- configuración de bundlers y TypeScript;
- cualquier migración aditiva incluida en el corte, mediante una estrategia
  compatible y no destructiva.

No se iniciará el siguiente contexto hasta comprobar que el corte actual puede
desplegarse y revertirse de forma independiente.

## Criterios de finalización de la fase 3

La fase 3 termina cuando:

- los 17 contextos tienen una sola unidad de distribución cada uno;
- los 55 manifests de capa candidatos se retiraron o su permanencia quedó
  justificada mediante una nueva decisión arquitectónica;
- no existen wrappers, aliases ni nombres heredados de transición;
- Web, Desktop y Mobile compilan con el grafo definitivo;
- el lockfile y los gates globales son reproducibles;
- el ADR 0037 se actualiza con la evidencia final y deja de describir deuda
  pendiente.

## Consecuencias

- Cada corte será más amplio que el endurecimiento de la fase 2 porque incluye
  consumidores de producción.
- El riesgo queda acotado al migrar un solo contexto y prohibir estados
  intermedios permanentes.
- El número de workspaces disminuirá sin reemplazar fragmentación física por
  compatibilidad oculta.
- La ejecución de esta propuesta requiere autorización explícita para iniciar
  el primer corte y modificar el Web de producción.
