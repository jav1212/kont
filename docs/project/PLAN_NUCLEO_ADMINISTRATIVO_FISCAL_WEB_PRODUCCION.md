# Entrega del núcleo administrativo y fiscal en Web de producción

Fecha: 16/10/2026. Estado: ejecución local parcial; no acredita despliegue ni aceptación funcional.

Este plan ejecuta en la Web raíz el [programa del núcleo administrativo y fiscal](PLAN_IMPLEMENTACION_NUCLEO_ADMINISTRATIVO_FISCAL.md). La prioridad es cerrar circuitos utilizables en producción a partir del código existente. Los hitos C0–C8 del programa conservan su significado; los hitos W de este documento organizan su entrega Web.

## 1. Alcance de la entrega

La superficie de entrega es la aplicación Next.js de producción: `app/(app)`, `app/api`, factories y presentación en `src/modules`. Los paquetes conservan las reglas y contratos. Esta es una migración Web explícita y acotada conforme al ADR 0039; no autoriza mover los directorios raíz ni refactorizar módulos ajenos al corte.

Se publican incrementos globales para las organizaciones con acceso al módulo. La configuración y los permisos se verifican en servidor por operación. Una empresa incompleta recibe un diagnóstico corregible; no bloquea a las demás. No se propone un piloto ni activación selectiva por empresa. Las restricciones comerciales existentes del producto siguen vigentes.

La primera entrega incluye configuración administrativa aceptada y el circuito de borrador fiscal de servicios en VES. La emisión fiscal real es una entrega posterior y depende del canal emisor y sus requisitos. Desktop/Mobile se validan si cambia un contrato que consumen; su paridad, hotelería y operación offline quedan fuera de esta entrega.

## 2. Base local inspeccionada

La revisión del 16/10/2026 fue estática sobre un árbol con numerosos cambios modificados y sin seguimiento. Los resultados remotos y builds registrados en septiembre son evidencia histórica, no certificación del candidato actual.

| Capacidad | Evidencia local | Trabajo antes de producción |
| --- | --- | --- |
| Bandeja y detalle fiscal | `app/(app)/sales/fiscal/page.tsx`, `[id]/page.tsx`; hooks fiscales | Aceptar navegación, permisos, paginación, estados, revisión y circuito desde ventas. |
| Preparación y revisión | `app/api/fiscal/sales/[id]/prepare`, `documents`, `documents/[id]/revise`, eventos; factory fiscal de ventas | Contrastar SQL efectivo, idempotencia, origen concurrente y aislamiento con el candidato. |
| Administración de empresa | `settings/company/page.tsx`; API de fechas, logo, numeración, series, naturaleza e identificadores secundarios; `administration-web.ts` | Inventariar cada control disponible, completar validación y consumidores; no reconstruir lo existente. |
| Política monetaria | Paquete companies y plan monetario; conexión Web pendiente según ese plan | Configuración, consulta, resolución confiable y snapshot en cada flujo incorporado. |
| Sucursales | Contratos y casos de uso en companies; consolidación en paquetes operativos | Verificar conexión Web y propagar contexto a escrituras y consultas con control de acceso. |
| Preferencias | API `app/api/preferences/**` y consumidores Web locales | Verificar aplicación por vista, alcance por usuario y campos obligatorios. |
| IVA | `app/(app)/fiscal/**`, `app/api/fiscal/iva/**` | Ejecutar el [plan IVA](PLAN_INTEGRACION_IVA.md); compartir evidencia y evitar otro motor de cálculo. |
| Tesorería | Pantallas, API y paquetes locales | Ejecutar el [plan Web de Tesorería](PLAN_TESORERIA_WEB_PRODUCCION.md); integrar cobros por contrato, sin duplicar su backlog. |
| Seguridad y auditoría | Pantallas locales en settings y capacidades portables | Verificar autorización efectiva y evidencia transaccional de los comandos incluidos. |

La confirmación en `app/api/sales/[id]/confirm/route.ts` y el formulario `src/modules/sales/frontend/components/sales-invoice-form.tsx` ya incluyen un circuito interno de emisión/registro IVA con serie. Debe inventariarse y aceptarse en W0/W2; no tratarlo como trabajo ausente ni como evidencia de un canal emisor externo. Si ese comando forma parte de la primera publicación, ampliar expresamente su aceptación a numeración, atomicidad, inmutabilidad y recuperación de su estado interno. El nombre `issued` por sí solo no demuestra aceptación por un proveedor externo.

La configuración IVA y series ya tiene superficie en `app/(app)/settings/iva/page.tsx`; el endpoint de series inspeccionado se limita a `sales_invoice`. Las preferencias de visibilidad tienen una lista permitida acotada a clientes y departamentos: ampliar vistas mediante IDs estables y contratos explícitos, sin asumir aplicación general. En cobros, `app/api/sales/receivables/**` y Tesorería deben acordar un único hecho de cobro y su reserva/depósito antes de conectarse para evitar registrar dos veces el mismo pago.

### Avance local — 16/10/2026

- Añadida lectura y configuración Web de la política monetaria en `settings/company`, con USD/EUR, motivo, versión esperada y clave idempotente; la API deriva actor, organización y empresa desde el contexto autenticado. No conecta aún la política a conversiones fiscales ni amplía el alcance VES del circuito fiscal.
- Añadida cobertura reproducible de la ruta Web de política monetaria para permisos, contexto de servidor, normalización y rechazo de entrada; el ensayo PGlite de la migración 289 cubre ACL, ámbito, revisiones, conflicto de versión, repetición concurrente y evento anterior/posterior. Los scripts están publicados como `test:company:monetary-policy:web` y `test:company:monetary-policy:sql`.
- El ensayo SQL fiscal local pasó: cubre persistencia/revisión de borradores, actor, idempotencia, aislamiento y evidencia inmutable sobre las migraciones 268/281–283. Se añadió el comando reproducible `test:fiscal:persistence:sql`.
- Se reforzó la frontera de escrituras de ventas: `POST /api/sales/[id]/unconfirm` ahora exige `sales.cancel`; la migración 369 impide modificar o borrar una factura vinculada a documento fiscal emitido/recibido o con cualquier intento de emisión. Los borradores sin intentos conservan edición comercial y revisión mediante control de versión. El primer intento del ensayo SQL quedó bloqueado por acceso a dependencias de `node_modules/.pnpm`; se repitió con Corepack y pasó.
- En la sesión de preparación de release, el ensayo SQL fiscal volvió a pasar; también pasaron los ensayos SQL/Web de política monetaria, build Next.js final (288 páginas), ESLint global (0 errores), auditorías `routes`/`shared`, checks y suites de Companies, Sales, Fiscal, Taxation, Treasury, Desktop y Client Remote. Estos resultados son locales; no acreditan staging ni aplicación de migraciones en el destino.
- `pnpm build` pasó desde una salida `.next` limpia, incluyendo TypeScript, generación de 288 páginas y trazas. `companies` pasó check y 110 pruebas; Tesorería pasó check y 44 pruebas. La auditoría de rutas pasó tras registrar `/treasury/reconciliation` y `/treasury/tax-policy` con permiso base `treasury.read`; las acciones internas conservan permisos más específicos.
- Se corrigió una URL no definida y una dependencia obsoleta en la consulta de pagos Treasury, y se quitó un tipo duplicado del adaptador de pagos. El build integral final se repitió con el WIP actual y generó las 288 páginas.
- Se excluyeron del lint los worktrees y artefactos/cachés locales. ESLint completo informó cero errores; la auditoría de rutas clasificó 99 páginas, 88 entradas de navegación y 205 handlers; `audit:shared` pasó sobre 993 fuentes.
- La primera publicación no está lista: falta prueba en navegador autenticado contra staging, comparación SQL efectiva en el entorno destino, ensayo real de recuperación y manifiesto reproducible. Las pruebas locales no sustituyen esas evidencias; los cambios locales ajenos impiden atribuir un deployment a este corte.

## 3. Orden de implementación

Ruta de primera publicación: **W0 → W1 → W2 → W3**. Continuación operativa: **W4 → W5 → W6**. El descubrimiento del emisor comienza en W0 y puede avanzar mientras se cierra la primera publicación.

| Hito | Resultado visible | Dependencia | Condición de cierre |
| --- | --- | --- | --- |
| W0 | Candidato reproducible y mapa de brechas vigente | Ninguna | Archivos, dependencias, migraciones, consumidores y estado desplegado identificados; baseline con fallos asignados. |
| W1 | Configuración empresarial utilizable en Web | W0 | Configuración persiste, se relee y se aplica en los consumidores del corte; permisos y conflictos verificados. |
| W2 | Venta de servicios → borrador → consulta → revisión | W1 para datos requeridos | Circuito autenticado aceptado, evidencia durable y cero efectos de emisión externa. |
| W3 | Primera versión disponible en Web de producción | W0–W2 | Candidato publicado, smoke autorizado y evidencia de versión; recuperación compatible comprobada. |
| W4 | Servicio → emisión recuperable → cobro → corrección | W3 y contrato emisor | C3/C4 aceptados, consulta de incertidumbre e idempotencia; integración de cobro único con Tesorería. |
| W5 | Bienes, sucursales y efectos físicos conciliados | W4 y preparación de stock | C5 aceptado: despacho/devolución únicos y corrección fiscal independiente. |
| W6 | Compras, caja, contabilidad e históricos conciliados | W5; planes IVA/Tesorería | C6–C8 aceptados; caminos de escritura anteriores retirados con lectura histórica preservada. |

### W0 — Fijar el candidato y el estado real

1. Registrar commit de origen y manifiesto de archivos del corte, incluidos los archivos sin seguimiento necesarios. Preservar los cambios ajenos; preparar una rama o checkout aislado cuando facilite una entrega reproducible.
2. Identificar deployment y commit actuales de producción, proyecto de BD asociado, variables requeridas y versiones efectivas de RPC. No asumir que el Supabase usado en desarrollo es producción.
3. Comparar migraciones locales contra el historial del entorno destino y revisar sus definiciones efectivas, grants, RLS y permisos por módulo. La numeración del archivo no acredita aplicación remota.
4. Mapear writers de ventas, POS, API heredada/v1 y RPC: guardar, confirmar, desconfirmar, borrar, cobrar y cambiar origen. Definir la protección requerida por cada estado fiscal.
5. Levantar baseline del candidato e inventario de configuración faltante. Los datos fiscales reales no se completan con fixtures.

Salida: manifiesto de entrega, matriz implementado/conectado/aceptado/desplegado, dependencias SQL y lista de bloqueos con propietario. Un fallo de build del candidato impide W3, aunque provenga de cambios anteriores.

### W1 — Cerrar configuración administrativa

Dividir en cortes pequeños; cada uno termina en formulario/API/paquete/persistencia/consumidor.

- **Identidad fiscal:** emisor, domicilio, naturaleza e identificadores aplicables; cliente con datos requeridos. Mostrar requisitos faltantes antes de preparar y repetir la validación en servidor.
- **Política monetaria:** configurar VES y referencias soportadas, revisión propia, motivo y concurrencia; resolver tasa oficial de la fecha según el contrato vigente. Mostrar indisponibilidad explícita y conservar snapshot. No introducir tasas manuales o fallback silencioso.
- **Numeración:** aceptar los contadores y series realmente soportados; documentar alcance por tipo, agotamiento y concurrencia. Un consecutivo administrativo no acredita numeración fiscal autorizada ni debe consumirse al crear un borrador offline.
- **Fechas y logo:** aceptar persistencia y permisos, aplicar formato en vistas del corte e incorporar logo a los PDFs acordados. Mantener fechas de dominio y contratos sin reinterpretación por formato visual.
- **Sucursales:** catálogo, selección y asociaciones autorizadas; contexto verificado por servidor. Incorporar presencia solo cuando exista heartbeat autenticado con ciclo de vida y limpieza. La presencia no acredita disponibilidad offline.
- **Preferencias:** aplicar visibilidad por usuario/vista conservando campos obligatorios; aceptar cambio de empresa y sesión sin filtrar estado de otro contexto.

La primera publicación requiere los datos y política que consume W2. Sucursales, presencia, PDFs y preferencias pueden publicarse en incrementos independientes cuando satisfagan su aceptación; no deben ampliar la fecha crítica de W2 sin una dependencia demostrada.

### W2 — Aceptar el circuito fiscal ya construido

Recorrido: seleccionar empresa → completar identidad y clasificación vigente → guardar y confirmar venta de servicios en VES → preparar borrador → abrir bandeja y detalle → consultar eventos → revisar explícitamente si cambió el origen y la revisión está permitida.

- Reutilizar las rutas y componentes existentes. Corregir textos que puedan presentar preparación como emisión efectiva.
- Validar importes y clasificación en servidor, con regla, versión, fecha e identidades congeladas en snapshot.
- Conservar documento y resultado ante reintento idéntico; rechazar clave reutilizada con otro contenido y devolver conflicto ante versión u origen obsoletos.
- La revisión exige motivo, versión y clave idempotente; conserva ID y eventos antes/después. Bloquearla cuando el estado o un intento de emisión la haga incompatible.
- Aceptar lista e historial paginados, importes exactos, errores recuperables, cambio de empresa, roles permitidos/denegados y acceso directo por URL.
- Definir y verificar todas las mutaciones heredadas sobre una venta vinculada a un documento. La política sobre borradores debe mantener detección de cambios; los emitidos requieren protección ante edición, desconfirmación y borrado.

No se presenta el circuito como cumplimiento fiscal completo. Su aceptación demuestra preparación y revisión de borradores con evidencia.

### W3 — Publicar y observar

1. Generar candidato desde el manifiesto de W0 con lockfile reproducible y checks requeridos aprobados.
2. Ensayar en staging representativo migraciones aditivas, versión anterior compatible, permisos, E2E y restauración correspondiente al corte.
3. Preparar manifiesto de release: commit, migraciones ausentes a aplicar, variables, contratos, pruebas, procedimiento y responsable de recuperación.
4. Aplicar únicamente migraciones revisadas que falten en el destino; comprobar compatibilidad y desplegar el candidato global.
5. Ejecutar smoke autenticado con organización y datos autorizados: consulta, operación válida, reintento, conflicto y usuario denegado. Registrar IDs y tratamiento de los datos de comprobación.
6. Observar errores, latencia, conflictos, duplicados y aislamiento durante la ventana y volumen representativos definidos en W0. Conservar evidencia por versión.

La implementación del plan no equivale a autorización para escribir datos reales ni desplegar ahora. Esas acciones se ejecutan cuando exista autorización de entrega y se identifique el destino concreto.

Ante incidente, detener comandos afectados y conservar consultas/evidencia. Volver solo a una versión compatible con documentos y protecciones ya persistidos; mantener esquema aditivo. Después de emisión real, resolver primero incertidumbre externa: no reenviar como operación nueva ni volver el documento a legado.

### W4–W6 — Completar el núcleo operativo

**W4:** elegir un canal, obtener contrato, consulta de estado, entorno de prueba y reglas de numeración. Implementar intentos/outbox/worker y recuperación de respuesta desconocida. Integrar cobro con Tesorería mediante identidad de origen y commit/idempotencia definidos. Correcciones mediante documentos compensatorios, conservando vínculo y evidencia. La validación tributaria y del proveedor bloquea la emisión dependiente, no W1–W3.

**W5:** extender a bienes solo con costo autoritativo de inventario, preparación de stock por sucursal y despacho único. Probar ventas parciales, devoluciones y carreras entre terminales. Conservar separadas las decisiones comerciales, fiscales y físicas.

**W6:** integrar compras/retenciones, saldos y asientos por documento con los planes propietarios. Ensayar clasificación y migración histórica sin reemitir ni recalcular documentos pasados. Conciliar conteos/importes por moneda y referencias, retirar writers incompatibles y completar manuales/restauración. Las ventas históricas sin atribución no reciben sucursal inferida automáticamente.

## 4. Backlog inicial ejecutable

| ID | Trabajo | Propietario | Dependencia | Aceptación |
| --- | --- | --- | --- | --- |
| WEB-NAF-001 | Manifiesto, deployment/BD destino y baseline | Principal + coordinación | Ninguna | Candidato reproducible y evidencia actual, sin mezclar cambios ajenos. |
| WEB-NAF-002 | Matriz de writers, permisos y SQL efectivo | Backend | 001 | Todas las entradas y protecciones identificadas. |
| WEB-NAF-003 | Cerrar identidad y configuración ya visible | Backend/Web | 001–002 | Persistencia, relectura, conflictos y autorización aceptados. |
| WEB-NAF-004 | Conectar política monetaria a Web y preparación | Backend/Web | 003 | Tasa exacta, revisión y snapshot; ausencia de política/tasa tratada. |
| WEB-NAF-005 | Aceptar preparación, bandeja, detalle y revisión | Backend/Web | 002–004 | Circuito completo con idempotencia, concurrencia y aislamiento. |
| WEB-NAF-006 | Completar sucursales y preferencias por consumidor | Backend/Web | 003 | Contexto autorizado y estado aislado; alcance por vista documentado. |
| WEB-NAF-007 | Ensayo, recuperación y release de borradores | Principal | 005; 006 solo si incluido | W3 con commit y evidencia desplegada. |
| WEB-NAF-008 | Contrato emisor y requisitos fiscales aprobados | Producto/tributario + Backend | Inicia en 001 | Recuperación y condiciones externas conocidas. |
| WEB-NAF-009 | Emisión, cobro y corrección de servicios | Backend/Web | 007–008 + contrato Tesorería | C3/C4 y cierre conciliado aceptados. |
| WEB-NAF-010 | Bienes, compras y contabilidad por cortes | Backend/Web | 009 | C5–C8 según planes propietarios. |

Un solo escritor por archivo/paquete. El coordinador organiza dependencias; Backend posee API/SQL y paquetes asignados; Web posee presentación; documentación actualiza el estado final estabilizado. Cada ticket enumera paths, contrato, exclusiones, validación y recuperación antes de implementarse.

## 5. Validación y criterio de entrega

En ejecución se requieren pruebas proporcionales de los paquetes afectados y consumidores directos, integración HTTP/SQL y E2E autenticado del circuito. Cubrir explícitamente acceso entre empresas, permisos denegados, importes, reintentos, dos terminales, fallo tras commit, origen modificado y revisión obsoleta. Las pruebas de escritura se realizan en entorno aislado salvo smoke real expresamente autorizado.

Para el candidato: `pnpm lint`, `pnpm audit:shared`, `pnpm build`, `git diff --check`; checks y tests de arquitectura según contratos modificados. Los comandos y sus prerrequisitos se revisan en W0. La raíz no dispone de una suite fiscal Web completa acreditada: definir comandos reproducibles para la aceptación nueva.

Cada capacidad solo se marca entregada con: UI utilizable, autoridad de servidor, persistencia compatible, permisos probados, evidencia durable, comportamiento de errores/concurrencia demostrado, TSDoc y documentación actualizadas, release identificable y recuperación practicable. Código local, migración aplicada y build aprobado son estados distintos de disponibilidad en producción.

No se fija fecha de publicación antes de W0. Al cerrarlo, estimar cada ticket con la brecha restante y capacidad disponible; el rango histórico de 13–22 semanas del programa completo no estima el trabajo pendiente de la primera entrega Web.

## 6. Referencias

- [Programa administrativo y fiscal](PLAN_IMPLEMENTACION_NUCLEO_ADMINISTRATIVO_FISCAL.md).
- [Política monetaria](PLAN_POLITICA_MONETARIA_EMPRESARIAL.md).
- [Integración IVA](PLAN_INTEGRACION_IVA.md).
- [Tesorería Web de producción](PLAN_TESORERIA_WEB_PRODUCCION.md).
- [ADR 0039: convergencia y migración Web](../adr/0039-phase-3-web-package-convergence.md).
- [Auditoría administrativa de septiembre](../audit/profitplus-administracion-packages-2026-09-28.md).
