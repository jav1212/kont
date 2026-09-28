# Implementación del núcleo administrativo y fiscal y migración controlada de Web

Fecha: 28/09/2026. Estado: C1, C2 y la persistencia de revisiones de borradores están validados en Supabase. La Web aún no se ha desplegado para disponibilidad global.

Alcance confirmado: fortalecer el núcleo de Kontave mediante sus paquetes y llevarlo a la Web de producción por cortes controlados. El modo hotel está excluido; requerirá aceptación comercial y planificación independiente.

Este documento convierte el [plan estratégico de cumplimiento](PLAN_CUMPLIMIENTO_FISCAL_Y_HOTELERIA.md) en entregables de ingeniería. No acredita cumplimiento normativo ni autoriza por sí mismo un despliegue. Las condiciones legales y de proveedor pendientes se resuelven en C0, sin impedir el trabajo portable que no dependa de ellas.

### Avance de ejecución

El corte implementado prepara borradores fiscales para facturas administrativas de venta confirmadas que contienen únicamente servicios en VES. Cada línea debe llevar un código de clasificación tributaria de servicio vigente; no admite IGTF ni ajustes globales. Antes de persistir, el servidor comprueba la identidad fiscal completa de emisor y cliente, la jurisdicción, los totales y la fecha de operación. Conserva en cada determinación la regla y clasificación que la originaron. Los reintentos devuelven el documento ya creado y rechazan un conflicto de origen, emisor o fecha.

Las migraciones 268, 281 y 282 están aplicadas en el proyecto Supabase `fvantswxhepvkloygcvc`. Las dos pruebas de humo remotas se revirtieron al terminar: comprobaron persistencia, consulta, eventos, reintentos, aislamiento por tenant/organización/empresa y rechazo de escrituras directas o RPC por usuarios autenticados. La prueba con el escritor heredado también confirmó que una línea sin identificador conserva el código tributario de servicio. No quedaron documentos ni eventos de prueba persistidos. El corte se expone a todas las organizaciones cuando la Web se despliegue; no usa piloto ni banderas de activación por empresa. La configuración incompleta bloquea únicamente la preparación inválida de esa empresa.

El siguiente incremento incorpora una bandeja fiscal Web paginada en `/sales/fiscal`, con detalle, historial paginado y comparación de snapshots. Un usuario con `sales.update` puede solicitar una revisión explícita con motivo, versión y clave idempotente. La revisión exige el mismo identificador del documento fiscal, reconstruye la venta confirmada de servicios en VES, protege contra cambios concurrentes de la fuente, bloquea intentos incompatibles y guarda un evento inmutable con estado anterior y posterior. El detalle informa el origen, la revisión y si puede revisarse. La migración 283, `fiscal_draft_revisions`, está aplicada en Supabase con la versión `20260928155709`.

## 1. Resultado esperado y reglas de ejecución

La Web debe poder ejecutar ventas, emisión fiscal, correcciones, cobros y conciliación con inventario y contabilidad usando reglas compartidas, evidencia durable y controles de servidor. Los cambios en impuestos o productos no deben alterar documentos anteriores. Un timeout o reintento no debe duplicar efectos.

La consolidación estructural de paquetes ya está documentada en el ADR 0039. No se reabre esa migración. Se completan capacidades y conexiones concretas, respetando los límites de producción establecidos en AGENTS.md.

Cada corte sigue esta secuencia:

1. Inventariar el comportamiento actual y fijar sus casos de aceptación.
2. Implementar dominio/aplicación y contratos en el paquete propietario.
3. Incorporar persistencia, autorización y API compatibles.
4. Integrar una experiencia Web acotada.
5. Probar el circuito y desplegarlo para todas las organizaciones cuando sus datos fiscales cumplan los requisitos.
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
| C1 | Documento y auditoría persistidos con controles de acceso | Implementado y comprobado en Supabase mediante RPC, eventos append-only, aislamiento y bloqueo de escrituras directas |
| C2 | Cálculo fiscal autoritativo y versionado | Preparación de borradores de servicios implementada; queda cargar y validar reglas, clasificaciones e identidades fiscales de cada empresa |
| C3 | Emisión recuperable por un canal | Contrato externo probado; incertidumbre y reintentos sin duplicación |
| C4 | Venta de servicio Web con emisión, cobro básico y corrección | Primer circuito completo aceptado para despliegue global |
| C5 | Venta de bienes, despacho y devolución conciliados | Una operación física única; corrección fiscal independiente |
| C6 | Caja y cuentas comerciales | Arqueo, anticipos, saldos, reembolsos y pagos conciliados |
| C7 | Compras/retenciones/contabilidad conectadas | Reportes y asientos conciliados por documento y período |
| C8 | Migración ampliada y operación mantenible | Empresa(s) migradas, caminos anteriores retirados y dossier completo |

### C0 — Diagnóstico ejecutable y decisiones

- Inventariar clientes Web/Desktop/Mobile, rutas antiguas y v1, RPC, permisos y tablas que pueden guardar, confirmar, desconfirmar o borrar una venta.
- Revisar cómo los RPC efectivos calculan costo de salida: detectar cualquier uso del precio de venta como costo de inventario antes de validar márgenes o asientos. La valoración pertenece a inventario.
- Registrar baseline de pruebas/builds y deudas preexistentes; identificar operaciones reales y volúmenes esperados por organización.
- Elegir una modalidad emisora y obtener su contrato técnico, consulta de estado, credenciales de prueba y reglas de numeración. Si es hardware, fijar modelo/firmware y acceso a equipo real.
- Confirmar aplicabilidad normativa y casos fiscales con responsable tributario; no cargar fixtures como reglas legales.
- Diseñar ADR para emisión/estados, auditoría, tesorería y estrategia de migración. Registrar qué paquete es el único escritor de cada entidad.
- Definir retención, RPO/RTO, disponibilidad, objetivos de latencia y ventana de observación del despliegue global según operación real.
- Definir permisos de operador, supervisor, auditor y soporte para todas las organizaciones. Separar privilegios de plataforma y de empresa.

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

Salida: todas las organizaciones con configuración fiscal completa pueden facturar, consultar, cobrar y corregir con evidencia. Ninguna operación nueva vuelve al modelo anterior por apagar una bandera.

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
| Despliegue global | Organizaciones, terminales y canal acordados; configuración protegida en servidor | Casos reales autorizados y cierre conciliado; supervisión de pendientes |
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
| IMP-002 | Matriz fiscal y contrato del canal de emisión | Ninguna | Casos, evidencias y recuperación conocidos; pendientes externos asignados |
| IMP-003 | ADR de estados, auditoría, tesorería y migración | 001–002 | Ownership y política de históricos/rollback sin ambigüedad |
| IMP-004 | Entorno aislado y baseline de pruebas | 001 | Comandos reproducibles y datos de prueba anonimizados |
| IMP-005 | Modelo/puertos de aplicación fiscal y auditoría | 003 | Pruebas de invariantes, estados e idempotencia |
| IMP-006 | Migración aditiva y commit transaccional | 004–005 | Pruebas SQL de aislamiento, unicidad e inmutabilidad |
| IMP-007 | Respaldo/restauración con conciliación | 004; completar con 006 | Recuperación medida de documentos, eventos y archivos |
| IMP-008 | Consulta Web fiscal y bitácora autorizada | 006 | Consulta individual, listado paginado y bitácora por empresa implementados, sin habilitar emisión; verificación SQL realizada |

## 9. Criterio de cierre del programa

El núcleo queda fortalecido cuando todas las organizaciones con configuración fiscal válida pueden emitir/corregir por el canal elegido, cobrar y conciliar caja, inventario y contabilidad; los cambios históricos están protegidos; la recuperación está ensayada; los consumidores anteriores no pueden saltarse controles; y los responsables disponen de manuales, alertas y evidencia por versión.

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

### Estado operativo del corte C2 — 27/09/2026

La persistencia fiscal se creó mediante la migración 268; la 281 añadió perfiles y asignaciones tributarias versionadas para servicios, y la 282 normaliza identificadores estables de líneas que los escritores heredados omiten. Las tres están registradas y aplicadas en Supabase: 268 (`20260927211749`), 281 (`20260927205746`) y 282 (`20260927211759`). El corte ofrece rutas para consultar y cambiar la clasificación de servicios y para preparar un borrador desde una factura de venta confirmada. Si esa venta se modifica o desconfirma después de preparar el borrador, un reintento devuelve `409` y conserva el snapshot existente. Este corte no incluye cancelación, reemplazo o emisión de borradores; tampoco se debe borrar evidencia ni recrear el origen para resolver ese conflicto. Los cobros, las notas correctivas, la conciliación y el modo hotel siguen fuera de este corte.

La validación final del corte aprobó 45 pruebas de ventas, 21 fiscales y 20 tributarias, además de tres chequeos de tipos. El build final de producción (`corepack pnpm build`) pasó, junto con la auditoría de autorización de rutas (83 páginas, 68 entradas de navegación y 164 handlers tenant). El lint dirigido del corte no produjo errores ni advertencias. La prueba SQL con PGlite y las pruebas de humo remotas verificaron la persistencia y el aislamiento; las verificaciones remotas se revirtieron y no dejaron perfiles, facturas, eventos ni documentos de prueba.

Para preparar un borrador, cada empresa debe contar con RIF y domicilio fiscal del emisor, identidad fiscal completa de los clientes que se vayan a facturar y perfiles de servicio con una regla IVA vigente y fundamento legal aprobado. La Web se despliega globalmente aunque alguna empresa aún no reúna esas condiciones; el servidor rechaza únicamente la operación incompleta. La inspección remota encontró 57 organizaciones y 74 empresas: dos empresas carecen de RIF y once de domicilio, distribuidas en diez organizaciones. Hay dos reglas IVA (gravado al 16 % y exento al 0 %) y ninguna clasificación de servicio ni venta confirmada compuesta solo por servicios. Sus fundamentos y la versión `legacy-production-1` requieren revisión tributaria; no se modificaron datos fiscales ni reglas automáticamente.

#### Runbook de despliegue y recuperación

1. Desplegar la Web que incluye el formulario administrativo, las rutas fiscales y sus permisos para todas las organizaciones.
2. Completar y revisar los datos fiscales y clasificaciones de cada organización; la aplicación debe rechazar la preparación cuando falte alguno.
3. Verificar en producción que una factura de servicio válida crea un borrador consultable y que un reintento devuelve ese mismo documento. Confirmar que no exista emisión externa en este corte.
4. Ante un fallo de aplicación, volver al binario Web anterior y conservar el esquema, documentos y eventos como evidencia. No eliminar tablas, columnas ni migraciones; toda corrección posterior debe ser aditiva y conciliada.

### Incremento de revisión de borradores — 28/09/2026

La revisión no sustituye la preparación normal. La preparación conserva su conflicto `409` cuando cambia el origen; la revisión es una operación explícita de un usuario autorizado y requiere motivo, versión esperada y clave idempotente. Solo permite reconstruir la misma venta confirmada de servicios en VES con el mismo identificador del documento fiscal. La operación compara el estado de la venta, aplica concurrencia optimista y registra antes/después en la bitácora inmutable. No permite cancelar, reemplazar arbitrariamente, emitir ni borrar un borrador.

La migración 283 se validó con PGlite y está aplicada en Supabase con la versión `20260928155709`. Las pruebas de humo remotas se ejecutaron dentro de transacciones revertidas: validaron metadatos de revisión, reemplazo, reintentos históricos, rechazo de versiones obsoletas, conflictos de idempotencia, guarda por actualización de origen, aislamiento de organización y actor, campos obligatorios, bloqueo tras intento de emisión y snapshots/actor antes y después. También confirmaron que usuarios anónimos y autenticados no pueden ejecutar los RPC, mientras que `service_role` sí puede hacerlo. Tras revertir no quedaron documentos ni facturas temporales, y no se modificaron datos financieros de producción. Las pruebas focalizadas aprobaron 88 casos: 24 fiscales, 47 de ventas, 3 del formateador Web y 14 de permisos raíz; la validación SQL se ejecutó por separado. El formateador cubre un codec fiscal real, exponentes y un valor superior a `MAX_SAFE_INTEGER`. El lint final de todos los archivos fiscales no tuvo errores ni advertencias, y la auditoría de autorización aprobó 85 páginas, 69 entradas de navegación y 165 handlers API. La compilación Webpack del build raíz terminó correctamente, pero el build queda bloqueado por tres errores TypeScript ajenos en `companies`: el adaptador Supabase no entrega `CompanyState.version` y la aplicación usa el literal `VE` incompatible con `CompanyCountry` en dos ubicaciones. `tsc --noEmit --incremental false` confirmó que no hay diagnósticos en archivos fiscales. Hay cambios concurrentes en el dominio, contratos, aplicación e índice de `companies`; este corte no los modifica. La revisión visual autenticada también queda pendiente porque no había navegador conectado.

La línea base de producción comprobada corresponde al despliegue Vercel `dpl_7dSupru7vSe7LcxHo3cdtvECz6hC`, estado `READY`, commit `e41944de17ee56c7e45f7f45d2ef211f2e88c405` y dominio `kontave.com`; sus API respondieron `401` sin inicio de sesión. Los cambios del incremento permanecen locales, sin commit ni push.
