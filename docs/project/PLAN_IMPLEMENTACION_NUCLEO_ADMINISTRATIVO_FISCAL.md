# Implementación del núcleo administrativo y fiscal y migración controlada de Web

Fecha: 23/09/2026. Estado: ejecución parcial; C1 tiene persistencia y consultas implementadas, pendiente validación SQL aislada.

Alcance confirmado: fortalecer el núcleo de Kontave mediante sus paquetes y llevarlo a la Web de producción por cortes controlados. El modo hotel está excluido; requerirá aceptación comercial y planificación independiente.

Este documento convierte el [plan estratégico de cumplimiento](PLAN_CUMPLIMIENTO_FISCAL_Y_HOTELERIA.md) en entregables de ingeniería. No acredita cumplimiento normativo ni autoriza por sí mismo un despliegue. Las condiciones legales y de proveedor pendientes se resuelven en C0, sin impedir el trabajo portable que no dependa de ellas.

### Avance de ejecución

Primer corte parcialmente completado en el repositorio: `@kontave/fiscal` publica contratos de persistencia, coordinación de aplicación, adaptador Supabase RPC-only y paginación por cursor estable. La migración aditiva 268 define documentos fiscales, comandos del proveedor, intentos de red, eventos append-only, alcance tenant/organización/empresa, RPC idempotentes y protección de documentos emitidos. Se conectaron `GET /api/fiscal/documents`, `GET /api/fiscal/documents/[id]` y `GET /api/fiscal/documents/[id]/events`, protegidos con `sales.read` y validación server-side de tenant, organización y empresa. Siguen pendientes escritura desde API/Web, integración con ventas y ejecución de la migración en una base aislada.

Verificado al 23/09/2026: `corepack pnpm --filter @kontave/fiscal check` pasó; `corepack pnpm --filter @kontave/fiscal test` pasó (20 casos); el lint dirigido pasó; la auditoría clasificó 159 rutas API; `corepack pnpm build` pasó con las tres rutas fiscales. El lint global reportó errores en archivos ajenos a fiscal. Sigue pendiente probar la migración en una base PostgreSQL aislada: no hay `psql`, Supabase CLI ni `pg_format`, y el daemon de Docker local no está activo. La migración no se aplicó en producción ni en un proyecto Supabase remoto. Próximo corte: preparar documentos fiscales desde ventas con snapshots tributarios reproducibles, sin habilitar emisión.

## 1. Resultado esperado y reglas de ejecución

La Web debe poder ejecutar ventas, emisión fiscal, correcciones, cobros y conciliación con inventario y contabilidad usando reglas compartidas, evidencia durable y controles de servidor. Los cambios en impuestos o productos no deben alterar documentos anteriores. Un timeout o reintento no debe duplicar efectos.

La consolidación estructural de paquetes ya está documentada en el ADR 0039. No se reabre esa migración. Se completan capacidades y conexiones concretas, respetando los límites de producción establecidos en AGENTS.md.

Cada corte sigue esta secuencia:

1. Inventariar el comportamiento actual y fijar sus casos de aceptación.
2. Implementar dominio/aplicación y contratos en el paquete propietario.
3. Incorporar persistencia, autorización y API compatibles.
4. Integrar una experiencia Web acotada.
5. Probar el circuito y habilitarlo gradualmente en la empresa piloto.
6. Retirar el camino anterior cuando se cumplan las condiciones de salida.

Los cortes de fundamento pueden desplegarse sin exposición operativa; no cuentan como funcionalidad terminada para usuarios. No acumular varios módulos de dominio sin conectar el primer circuito completo. Las ventanas temporales de compatibilidad de datos/APIs no deben convertirse en wrappers permanentes ni duplicación de reglas.

## 2. Punto de partida técnico

| Área | Evidencia actual | Trabajo necesario |
| --- | --- | --- |
| `@kontave/fiscal` | Dominio, aplicación, puerto de persistencia, adaptador Supabase RPC-only y consulta Web por ID | Listado, autorización por módulo, escritura API, pruebas SQL aisladas, cálculo tributario/emisión y recuperación; no confundir agregado con emisor operativo |
| `@kontave/taxation` | Reglas, políticas, perfiles, aplicación y adaptador Supabase | Gobierno de vigencias y aprobación; determinación autoritativa ligada a emisión |
| `@kontave/monetary` | Dinero exacto, tasas y proveedor BCV | Uso coherente en cada flujo, snapshots, políticas de redondeo y tasa no disponible |
| `@kontave/sales` | Órdenes, despachos, devoluciones, aplicación y adaptadores | Conectar comandos operativos de Web al circuito nuevo; revisar diferencias con ventas heredadas |
| Ventas Web | Rutas `/api/sales`, confirmación/desconfirmación, POS y repositorio compartido | Separar estado comercial y fiscal, retirar mutaciones incompatibles con emisión |
| Compras/inventario | Operación Web y paquetes existentes | Movimientos compensatorios, idempotencia y conciliación entre registros |
| Contabilidad | Cuentas, asientos, períodos e integraciones en `src/modules/accounting` | Añadir integración fiscal/financiera; no reconstruir ni migrar todo el módulo por anticipado |
| Auditoría y continuidad | Controles parciales; observabilidad técnica; comando de backup con script ausente en la inspección inicial | Evidencia de negocio protegida, respaldo real y restauración probada |
| Device Bridge | Infraestructura local y lectores | Adaptador de impresora fiscal solo si se elige ese canal |

La inspección es estática. C0 verificará las definiciones SQL efectivas después de todas las migraciones y el estado del entorno desplegado: una migración histórica no demuestra por sí sola el comportamiento actual de producción.

## 3. Responsabilidades y ubicación del código

| Propietario lógico | Rutas existentes / propuestas | Responsabilidad |
| --- | --- | --- |
| Fiscal | `packages/business/fiscal/**` | Documento, aplicación de emisión/corrección, puertos y adaptadores específicos |
| Tributación y dinero | `packages/business/taxation/**`, `packages/monetary/**` | Determinaciones, reglas versionadas y aritmética; fiscal conserva resultados históricos |
| Ventas e inventario | `packages/business/sales/**`, `packages/business/inventory/**` | Acuerdo, despacho, devoluciones y efectos físicos/valoración |
| Compras | `packages/business/purchasing/**`, integración en `src/modules/purchases/**` | Documentos recibidos, retenciones y obligaciones del proveedor |
| Auditoría | Contexto propuesto en `packages/capabilities/audit/**`, sujeto a ADR | Contrato de evidencia y consulta; no reemplaza observabilidad técnica |
| Tesorería comercial | Contexto propuesto en `packages/business/treasury/**`, sujeto a ADR | Cobros/pagos, anticipos, saldos y movimientos de caja; separado de billing y pagos de suscripción |
| Servidor Web | `app/api/**`, factories de `src/modules/**/backend`, `src/client-api/v1/**` | Composición, autenticación y traducción de contratos; no duplicar reglas del paquete |
| Persistencia | `supabase/migrations/**` y adaptadores propietarios | Esquema, transacciones, permisos, restricciones y compatibilidad |
| Presentación Web | `app/(app)/**`, `src/modules/**/frontend/**` | Formularios, estados, recuperación guiada y consultas |
| Dispositivos | `packages/platform/devices/**`, `apps/device-bridge/**` | Protocolo y evidencia del equipo; solo para modalidad física |

Los nombres nuevos son propuestas, no paquetes existentes. C0 decide sus fronteras y exports antes de crearlos. Un solo paquete propietario por contexto; no crear workspaces distintos para cada capa ni módulos genéricos `utils`/`shared`.

Dominio y aplicación definen puertos sin Supabase, HTTP o UI. Las rutas usan factories. La Web no importa internals del paquete. El servidor recalcula y valida importes, autorización e identidad; no confía en totales, roles o empresa enviados por el navegador.

Evitar ciclos: `taxation` ya dispone de una integración hacia `fiscal`; el dominio fiscal no debe importar `taxation`. Los casos de uso consumen puertos estructurales y la composición conecta implementaciones. Igual criterio para coordinar ventas, inventario y tesorería.

## 4. Secuencia de cortes y dependencias

Ruta principal: C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8. Descubrimiento del proveedor, preparación de restauraciones y diseño contable pueden avanzar en paralelo; la emisión operativa depende de sus controles previos.

| Corte | Entregable demostrable | Condición para pasar al siguiente |
| --- | --- | --- |
| C0 | Contratos, inventario, decisiones de emisión y baseline | Alcance del primer circuito y reglas de compatibilidad definidos |
| C1 | Documento y auditoría persistidos con controles de acceso | No se altera un emitido; aislamiento y restauración comprobados |
| C2 | Cálculo fiscal autoritativo y versionado | Casos tributarios validados, snapshots y reglas vigentes reproducibles |
| C3 | Emisión recuperable por un canal | Contrato externo probado; incertidumbre y reintentos sin duplicación |
| C4 | Venta de servicio Web con emisión, cobro básico y corrección | Primer circuito completo aceptado en piloto |
| C5 | Venta de bienes, despacho y devolución conciliados | Una operación física única; corrección fiscal independiente |
| C6 | Caja y cuentas comerciales | Arqueo, anticipos, saldos, reembolsos y pagos conciliados |
| C7 | Compras/retenciones/contabilidad conectadas | Reportes y asientos conciliados por documento y período |
| C8 | Migración ampliada y operación mantenible | Empresa(s) migradas, caminos anteriores retirados y dossier completo |

### C0 — Diagnóstico ejecutable y decisiones

- Inventariar clientes Web/Desktop/Mobile, rutas antiguas y v1, RPC, permisos y tablas que pueden guardar, confirmar, desconfirmar o borrar una venta.
- Revisar cómo los RPC efectivos calculan costo de salida: detectar cualquier uso del precio de venta como costo de inventario antes de validar márgenes o asientos. La valoración pertenece a inventario.
- Registrar baseline de pruebas/builds y deudas preexistentes; identificar operaciones reales del piloto y volúmenes esperados.
- Elegir una modalidad emisora y obtener su contrato técnico, consulta de estado, credenciales de prueba y reglas de numeración. Si es hardware, fijar modelo/firmware y acceso a equipo real.
- Confirmar aplicabilidad normativa y casos fiscales con responsable tributario; no cargar fixtures como reglas legales.
- Diseñar ADR para emisión/estados, auditoría, tesorería y estrategia de migración. Registrar qué paquete es el único escritor de cada entidad.
- Definir retención, RPO/RTO, disponibilidad, objetivos de latencia y ventana de observación del piloto según operación real.
- Seleccionar empresa piloto y permisos: operador, supervisor, auditor, soporte. Separar privilegios de plataforma y de empresa.

Salida: inventario versionado, decisiones, matriz de permisos, escenarios con resultados esperados, mapa de datos y tickets estimados. Las decisiones externas pendientes tienen propietario y bloquean únicamente el entregable dependiente.

### C1 — Persistencia fiscal, auditoría y recuperación

- Añadir a `fiscal` los casos de uso y puertos de repositorio/commit necesarios. Mantener el documento y la entrega al emisor como ciclos distintos.
- Diseñar entidades persistidas para documento/snapshots, vínculo comercial, intento de emisión, evidencia, idempotencia y outbox. Nombres finales en ADR y migración aditiva nueva; no editar migraciones históricas.
- Grabar cambios de negocio y evento de auditoría durable en la misma transacción. Si la evidencia no puede guardarse, no confirmar localmente la operación.
- Incluir restricciones compuestas de empresa/origen, concurrencia optimista o bloqueos donde corresponda, identidad autenticada y control de privilegios de funciones SQL.
- Proteger emitidos contra edición/borrado por cualquier ruta operativa. Los accesos privilegiados requieren controles y evidencia; no prometer inviolabilidad solo con RLS o hashes.
- Incorporar consulta Web de detalle/bitácora para personal autorizado; habilitación operativa aún apagada.
- Acreditar respaldo de BD, documentos y acuses; ejecutar restauración en entorno aislado con conciliación. Corregir o sustituir el comando de backup ausente según mecanismo elegido.

Pruebas: API y SQL directos, cruce de empresas, intento de alterar emitidos, fallo antes/después del commit, repetición de clave con mismo contenido y rechazo con contenido diferente, recuperación de backups.

### C2 — Tributación y moneda con autoridad de servidor

- Completar selección de reglas por empresa, jurisdicción, fecha efectiva y tratamiento; edición mediante propuesta/aprobación y nueva versión.
- Reutilizar `Money` y decimales exactos. Definir redondeo por línea/documento y ajustes permitidos según modalidad, sin usar tolerancias para ocultar diferencias.
- Guardar emisor/receptor, líneas, bases, impuestos, versión de regla y evidencia cambiaria como snapshot; no recalcular emitidos desde catálogos actuales.
- Resolver conflictos entre cotización y confirmación: una previsualización queda identificada por versión; si las condiciones cambian, devolver diferencia y exigir nueva confirmación de la operación.
- Tratar ausencia de regla o tasa válida con error tipado y flujo explícito; nunca asumir exención o tasa cero.
- Integrar administración tributaria y previsualización Web; el cálculo de navegador puede asistir, pero no autoriza emisión.

Salida: casos validados por contador, pruebas de vigencia y cambio de fecha, resultados reproducibles y código de error estable para condiciones incompletas.

### C3 — Canal de emisión y reconciliación

- Implementar puerto del emisor y un adaptador real. Primero simulador de fallos y contrato; después entorno externo de pruebas y validación real del canal.
- Modelar entrega persistente: pendiente, en proceso, aceptada, rechazada y resultado incierto, o equivalentes acordados. No convertir timeout en rechazo definitivo ni en nueva emisión automática.
- Persistir intención antes de llamar al emisor. Usar outbox, exclusión por operación/terminal, reintentos acotados y recuperación de workers interrumpidos.
- Reconciliar mediante identidad externa verificable. Si el proveedor no ofrece idempotencia/consulta suficiente, definir resolución manual autorizada y bloqueo de reenvío; nunca inventar garantía de emisión única.
- Guardar acuse y numeración asignada por el canal. No asignar números que correspondan al dispositivo/proveedor desde un contador local arbitrario.
- Proteger callbacks cuando existan, rechazar duplicados o mensajes fuera de orden y mantener evidencia de intentos.
- Incorporar bandeja Web de pendientes y excepciones con acciones permitidas y trazabilidad.
- Si se usa máquina fiscal: probar estado, corte de energía/red, papel, rechazo, reimpresión y cierres aplicables en equipo real. El simulador no habilita producción.

Salida: pruebas de contrato y de recuperación aprobadas. No se expone emisión general; C4 conecta el circuito comercial y sus guardas.

### C4 — Primer circuito Web: servicio, cobro básico y corrección

- Extender la composición de ventas para coordinar tributación, fiscal y registro mínimo de cobro en tesorería. Ese registro es durable, idempotente y pertenece a su contexto; no se añade como atajo en billing.
- Añadir contratos/API de preparar, emitir, consultar, corregir y obtener representación. Los nombres definitivos se fijan con convenciones del repo, sin inventar un segundo API paralelo permanente.
- Separar los indicadores visibles de venta, emisión y cobro. Distinguir representación preliminar de documento emitido y mostrar resultado incierto sin ofrecer reemisión ciega.
- Bloquear guardar/desconfirmar/eliminar cuando exista emisión o emisión pendiente/incierta. Aplicar la regla en API y SQL, incluidos caminos heredados, sin depender del botón visible.
- Vincular notas de crédito/débito a su original y validar alcance/acumulación para impedir correcciones excesivas o concurrentes incompatibles. Reimpresión conserva identidad y registra motivo/actor.
- Definir recuperación cuando emisión y cobro no concluyen juntos. La factura aceptada no desaparece porque falle el registro del cobro: queda excepción conciliable, con política explícita de saldo.
- Implementar fixture de venta de servicio para no introducir inventario en este primer corte. Probar también cobro rechazado, parcial y repetido según alcance mínimo aprobado.

Salida: una empresa piloto completa factura, consulta, cobro y nota correctiva con su evidencia. Ninguna operación nueva vuelve al modelo anterior por apagar una bandera.

### C5 — Bienes, inventario y devoluciones

- Conectar despachos/devoluciones de `sales` con aplicación de `inventory` por puertos y eventos durables; confirmar fiscalmente no implica despacho automático por definición.
- Ofrecer en POS una operación coordinada cuando proceda, conservando las identidades de venta, despacho, documento y cobro.
- Impedir descargas duplicadas entre el RPC antiguo de confirmación y el nuevo consumidor. El router de operaciones asigna un solo escritor y motor por operación.
- Reemplazar en el nuevo circuito borrado de movimientos por efectos compensatorios según políticas de inventario; verificar saldo, costo y períodos cerrados.
- Diferenciar nota correctiva, retorno físico y devolución de dinero. Pueden ocurrir en momentos distintos y deben conciliarse.

Salida: venta de bienes, entrega parcial si entra en el alcance, devolución y corrección fiscal sin movimientos ni costos duplicados; inventario histórico preservado.

### C6 — Tesorería comercial y caja

- Ampliar el registro mínimo de C4 a cuentas por cobrar/pagar, asignaciones de pagos, anticipos, reembolsos y saldos por moneda.
- Incorporar apertura de turno, movimientos, arqueo, diferencias, cierre y revisión por supervisor. Separar moneda recibida, importe reconocido y tasa utilizada.
- Registrar operaciones financieras con evidencia independiente de la factura; corregir mediante reversos autorizados y conciliables.
- Integrar pasarelas o bancos únicamente si están en el alcance acordado. No almacenar secretos en auditoría ni confiar en confirmaciones del cliente.
- Probar concurrencia de asignaciones, cobros que exceden saldo, reapertura autorizada y documentos de períodos cerrados.

Salida: caja y saldos conciliados con documentos y cobros; responsables y motivos de diferencias disponibles.

### C7 — Compras, retenciones y contabilidad

- Reutilizar compras y sus salidas actuales de retenciones; validar recepción, corrección y enlace financiero, sin tratar una factura del proveedor como emisión propia.
- Conectar eventos fiscales/financieros al módulo contable existente; mapear cuentas, impuestos, medios de pago y fechas operativas bajo reglas versionadas.
- Persistir identidad del evento de origen para contabilizar una sola vez. Reintentos no duplican asientos; períodos cerrados y reversos siguen política explícita.
- Evitar que integración previa de compras y nueva integración fiscal contabilicen el mismo hecho dos veces.
- Ofrecer consulta desde documento a asiento/movimiento y desde reporte a documento; conciliar IVA, retenciones aplicables, saldos y movimientos.

Salida: muestra representativa y cierre de período conciliados por contador. Extraer más contabilidad a paquetes solo si el corte lo necesita y mediante alcance específico.

### C8 — Ampliación del despliegue y retiro de legado

- Migrar cohortes de empresas con lectura histórica compatible, validación de acceso y conciliación por empresa.
- Completar documentación, soporte, alertas, retención y ensayos de recuperación; registrar versión y configuración de cada liberación.
- Retirar comandos, writers, flags e imports anteriores cuando no tengan consumidores ni operaciones pendientes y termine la ventana de compatibilidad.
- Mantener lectura de originales históricos y referencias externas cuando corresponda; retirar código no significa borrar historia.

Salida: no hay duplicación de reglas o writers activos para el mismo flujo; cada empresa sabe qué circuito utiliza y cada operación conserva su procedencia.

## 5. Protocolo de migración de datos y contratos

La transición se realiza por expansión → migración → retiro:

Mantener el esquema operativo compartido como fuente de verdad, conforme al ADR 0030. Los registros fiscales son entidades distintas vinculadas a la venta mediante identidad de origen protegida; no crean una segunda tabla operativa de ventas con escritura independiente. Una sustitución futura del almacenamiento comercial requeriría un corte adicional con transferencia explícita de ownership. La unicidad de emisión se define por intención comercial y alcance facturado, admitiendo únicamente particiones/correcciones modeladas; cambiar de canal no permite repetir la misma emisión.

1. **Expandir:** nuevas tablas/campos/índices y contratos compatibles; registrar versión de esquema y operación. API desplegada inicialmente sin activar comandos nuevos.
2. **Clasificar históricos:** distinguir borradores, ventas confirmadas administrativamente, documentos con evidencia externa y casos sin evidencia suficiente. No inferir emisión por el estado `confirmada`.
3. **Ensayar:** importación en staging con conteos, importes por moneda, saldos, referencias y huellas de contenido cuando proceda. La conversión es repetible y tiene checkpoint.
4. **Migrar referencias:** preservar IDs originales, número/fecha original y procedencia; registrar mapeo y excepciones. No recalcular impuestos, reemitir ni asignar numeración fiscal nueva a históricos.
5. **Enrutar:** selección por empresa y tipo de operación desde servidor; asignación estable al crear la operación. Clientes viejos no pueden editar registros gestionados por el motor nuevo.
6. **Conciliar:** comparar lecturas e informes. Un modo sombra puede calcular y comparar; nunca emitir, cobrar, contabilizar o mover stock dos veces.
7. **Retirar:** tras la observación y resolución de excepciones, retirar escritura anterior, después compatibilidad temporal. Mantener lectura histórica necesaria.

Una lectura dual temporal necesita reglas de precedencia y deduplicación por identidad de origen. No se implementará doble escritura informal desde la UI. Cualquier proyección secundaria se actualiza con evento durable e idempotente.

## 6. Despliegue, observación y reversión

| Etapa | Alcance | Evidencia requerida |
| --- | --- | --- |
| Desarrollo | Fixtures y simulador | Dominio, errores, concurrencia y fallos reproducibles |
| Staging | Datos anonimizados, BD representativa y proveedor de prueba | Migraciones, permisos, contratos y E2E; restauración |
| Producción desactivada | Esquema/API compatibles, sin nuevos comandos habilitados | Salud, compatibilidad de versión anterior y lectura histórica |
| Piloto | Empresa/terminal/canal acordados; configuración protegida en servidor | Casos reales autorizados y cierre conciliado; supervisión de pendientes |
| Expansión | Cohortes acordadas por volumen y riesgo | Misma evidencia, sin incidentes críticos abiertos ni diferencias inexplicadas |
| Retiro | Sin writers/operaciones pendientes del camino anterior | Inventario de consumidores vacío y procedimientos actualizados |

C0 fija duración y volumen de observación. No se amplía por mero paso del tiempo: debe haberse completado el conjunto de casos representativos, al menos un cierre operativo aplicable y la conciliación de los efectos.

Motivos de detención inmediata: emisión duplicada, acceso entre empresas, pérdida/alteración de evidencia, descuadre económico no explicado o recuperación insegura. Ante fallos de infraestructura, detener admisión de nuevas operaciones afectadas, conservar intentos y conciliar pendientes.

Después de la primera emisión real, apagar una función no devuelve esa operación a legado. Mantener consultas, protección de emitidos y reconciliación con una versión compatible; no revertir a un binario que permita mutar esos datos. No borrar columnas/tablas ni restaurar toda la BD sobre operaciones posteriores para revertir código. La recuperación de desastre exige conciliar documentos aceptados externamente después del punto restaurado.

## 7. Validación técnica por corte

Antes de integrar, ejecutar checks/tests de los paquetes modificados y sus consumidores directos. Ejemplo de C1/C2:

```powershell
pnpm --filter @kontave/fiscal check
pnpm --filter @kontave/fiscal test
pnpm --filter @kontave/taxation check
pnpm --filter @kontave/taxation test
pnpm --filter @kontave/sales test
pnpm --filter @kontave/purchasing test
```

En cortes que cambian API/Web/SQL, añadir pruebas propias de integración y E2E: API/SQL no confiables, autorización, empresa manipulada, idempotencia, carrera entre terminales, interrupción del worker, snapshot de reglas, notas y conciliación. Deben añadirse como comandos reproducibles; hoy no existe una suite Web fiscal que pueda darse por aprobada.

Para el candidato de liberación y contratos compartidos:

```powershell
pnpm check:architecture
pnpm test:architecture
pnpm lint
pnpm audit:shared
pnpm build
git diff --check
```

Revisar los scripts antes de ejecutarlos contra entornos externos; las pruebas con escritura usan BD aislada. Builds Desktop/Mobile y Device Bridge se ejecutan si cambian contratos/dependencias que consumen. No repetir todas las suites por cambios documentales; deudas previas quedan registradas y no ocultan regresiones.

Definition of done por corte: comportamiento de aceptación demostrado; errores tipados; API pública documentada con TSDoc; imports extensionless; migración compatible; permisos verificados; correlación y auditoría; controles de idempotencia; pruebas necesarias; runbook y documentación del estado real; evidencia de despliegue/reversión. Un flag apagado no sustituye estos requisitos.

## 8. Organización de entregas y estimación

| Bloque | Cortes | Rango inicial |
| --- | --- | --- |
| Descubrimiento y diseño | C0 | 1–2 semanas |
| Fundamento fiscal | C1–C2 | 3–5 semanas |
| Primer circuito completo | C3–C4 | 4–6 semanas |
| Administración integrada | C5–C7 | 3–5 semanas |
| Ampliación y estabilización | C8 | 2–4 semanas |

Rango agregado de referencia: 13–22 semanas, coherente con el plan estratégico, suponiendo dos ingenieros, QA parcial, producto y disponibilidad semanal de contador. Es una hipótesis inicial de baja confianza hasta C0: tesorería amplia, hardware sin contrato de recuperación, datos históricos inconsistentes o nuevos proveedores pueden ampliar el plazo. No se compromete una fecha ni presupuesto con esta estimación.

Cada corte puede necesitar varios PR: contrato/paquete → SQL/adaptadores → API → Web → pruebas/documentación. Los PR parciales permanecen sin habilitación operativa hasta completar la aceptación. Cada ticket registra propietario, paths permitidos, exclusiones, contrato, dependencia, prueba y condición de rollback.

Roles: `project_manager` coordina dependencias; `backend_engineer` posee paquetes asignados/API/SQL; `web_engineer` posee presentación; `desktop_engineer` interviene en Bridge solo con asignación explícita; `documentation_engineer` actualiza documentos del diff estabilizado. El responsable principal integra y valida consumidores. Un solo escritor por archivo/paquete y normalmente un máximo de tres especialistas concurrentes, conforme al repositorio.

Primer lote de tickets listo para desglosar:

| ID | Ticket | Dependencia | Criterio de cierre |
| --- | --- | --- | --- |
| IMP-001 | Inventario de comandos de venta y RPC efectivos | Ninguna | Todas las entradas de escritura y sus permisos mapeados |
| IMP-002 | Matriz fiscal y contrato del canal piloto | Ninguna | Casos, evidencias y recuperación conocidos; pendientes externos asignados |
| IMP-003 | ADR de estados, auditoría, tesorería y migración | 001–002 | Ownership y política de históricos/rollback sin ambigüedad |
| IMP-004 | Entorno aislado y baseline de pruebas | 001 | Comandos reproducibles y datos de prueba anonimizados |
| IMP-005 | Modelo/puertos de aplicación fiscal y auditoría | 003 | Pruebas de invariantes, estados e idempotencia |
| IMP-006 | Migración aditiva y commit transaccional | 004–005 | Pruebas SQL de aislamiento, unicidad e inmutabilidad |
| IMP-007 | Respaldo/restauración con conciliación | 004; completar con 006 | Recuperación medida de documentos, eventos y archivos |
| IMP-008 | Consulta Web fiscal y bitácora autorizada | 006 | Consulta individual, listado paginado y bitácora por empresa implementados, sin habilitar emisión; falta verificación SQL aislada |

## 9. Criterio de cierre del programa

El núcleo queda fortalecido cuando el piloto y las cohortes acordadas pueden emitir/corregir por el canal elegido, cobrar y conciliar caja, inventario y contabilidad; los cambios históricos están protegidos; la recuperación está ensayada; los consumidores anteriores no pueden saltarse controles; y los responsables disponen de manuales, alertas y evidencia por versión.

El modo hotel no bloquea este cierre. Desktop y Mobile conservarán compatibilidad con los contratos que consumen, pero la paridad funcional completa en esas superficies requiere alcance separado.

## 10. Referencias de implementación

- [Plan estratégico y matriz de brechas](PLAN_CUMPLIMIENTO_FISCAL_Y_HOTELERIA.md).
- [Exports actuales de fiscal](../../packages/business/fiscal/package.json), [ventas](../../packages/business/sales/package.json) y [tributación](../../packages/business/taxation/package.json).
- [Aplicación de ventas](../../packages/business/sales/src/application/index.ts) y [factory Web](../../src/modules/sales/backend/infra/sales-factory.ts).
- [Desconfirmación heredada](../../supabase/migrations/211_sales_pos_channel.sql): referencia que C0 contrasta contra migraciones posteriores y despliegue efectivo.
- [Contabilidad existente](../../src/modules/accounting/backend/infrastructure/accounting-factory.ts).
- [Convergencia de paquetes](../adr/0039-phase-3-web-package-convergence.md) y [fronteras de ventas](../adr/0024-sales-dispatch-fiscal-and-pos-boundaries.md).
- [Fuente operativa compartida](../adr/0030-shared-operational-schema-as-single-source.md).
- [Observabilidad y distinción de auditoría](../standards/observability.md).

En esta fase se añadieron contratos, coordinación de aplicación, adaptador Supabase, lectura individual, listado paginado y consulta de bitácora por empresa en `@kontave/fiscal`, junto con pruebas unitarias y la migración aditiva 268. La escritura por API/Web, activación por empresa, reglas tributarias autoritativas, emisión, conciliación, migración de históricos y despliegues permanecen pendientes. No se modificó la base de datos remota.
