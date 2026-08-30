# ADR 0039: Fase 3 de convergencia de paquetes y migración Web

- Estado: propuesto
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
