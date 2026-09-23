# Plan de fortalecimiento administrativo y fiscal de Kontave

Fecha de evaluación: 23 de septiembre de 2026. Estado: propuesta para discusión y priorización; no constituye una certificación ni una declaración de cumplimiento.

Desglose técnico: [plan de implementación del núcleo y migración controlada de Web](PLAN_IMPLEMENTACION_NUCLEO_ADMINISTRATIVO_FISCAL.md), con cortes, ownership, pruebas, tratamiento de históricos y despliegue gradual. El modo hotel permanece fuera de esa implementación.

Avance de implementación: ya hay un primer fundamento aditivo en `@kontave/fiscal`, el adaptador RPC de servidor, la migración 268, consulta individual, listado Web paginado y consulta de bitácora protegidos por organización y empresa. Emisión, escritura desde API/Web y validación de SQL en una base aislada siguen pendientes. La migración no se ha aplicado a ningún entorno remoto.

## 1. Decisión estratégica propuesta

Desarrollar un núcleo administrativo y fiscal verificable, reutilizable por distintos sectores, y conectar sobre él la operación hotelera. El primer entregable debe ser un circuito completo de operación con evidencia: venta, cálculo tributario, emisión fiscal, cobro, corrección, auditoría y recuperación ante fallos.

La referencia recibida es `Homologacion de sistema administrativo hotelero.docx`. Se leyó su contenido textual completo. Mezcla disposiciones normativas, recomendaciones empresariales y funcionalidades hoteleras; estos tres tipos de requisito deben gestionarse por separado.

**Alcance confirmado por el usuario:** fortalecer primero el núcleo administrativo y fiscal. El modo hotel solo se incorpora si el cliente acepta esa ampliación. No forma parte del compromiso, presupuesto ni criterio de cierre del núcleo. PMS significa sistema de gestión de reservas y operación del alojamiento.

No se propone reconstruir Kontave: se aprovecharán sus capacidades existentes de ventas, compras, inventario, dinero, tributación, documentos fiscales, identidad y dispositivos.

## 2. Actualización del punto de partida normativo

El documento recibido fundamenta el trámite en SNAT/2024/000121. La investigación del 22/09/2026 encontró una actualización material: la reproducción de SNAT/2026/00084 indica la derogación de aquella providencia, publicada en Gaceta Oficial 43.435 del 12/08/2026. Coinciden el análisis de Acceso a la Justicia y una publicación de The Factory HKA del 16/09/2026. Véanse [el texto reproducido](https://tugacetaoficial.com/leyes/providencia-administrativa-snat-2026-00084-derogatoria-de-normas-deproveedores-de-sistemas-informaticos-utilizados-para-la-emision-de-facturas-y-otros-documentos-fiscales/) y [Acceso a la Justicia](https://accesoalajusticia.org/seniat-permite-el-uso-de-cualquier-sistema-contable/).

No se obtuvo en esta revisión una copia directamente desde un portal oficial del SENIAT. Antes de asumir compromisos comerciales o iniciar trámites, el responsable tributario debe cotejar la Gaceta oficial y confirmar la vigencia y aplicabilidad del régimen correspondiente.

La distinción entre autorización del proveedor de software y obligaciones de facturación sigue siendo esencial. La publicación de [The Factory HKA](https://imprenta.thefactoryhka.com.ve/facturacion-digital/providencia-snat-2026-00084-que-cambia-para-la-facturacion-digital-en-venezuela/) identifica SNAT/2024/000102 como marco de medios digitales y diferencia software administrativo de imprenta digital. Su información orienta el descubrimiento; no reemplaza una revisión del caso de cada contribuyente.

Consecuencias para el plan:

- No presupuestar como obligación vigente el procedimiento histórico de la 000121 sin validarlo.
- Mantener integridad, trazabilidad, auditoría y continuidad como requisitos de calidad del producto.
- Definir requisitos por modalidad: máquina fiscal, emisión digital mediante proveedor autorizado u otra modalidad legalmente aplicable.
- No asumir que todo sistema debe conectarse directamente a una API del SENIAT. Identificar quién transmite, qué transmite y bajo qué contrato antes de desarrollar el conector.
- Tratar reservas, ocupación, restaurante y contabilidad como alcance comercial hotelero; no atribuirles una obligación universal de homologación.
- Verificar separadamente requisitos de persona natural o jurídica, contratos y responsabilidades. No convertir recomendaciones societarias del documento en requisitos legales confirmados.

## 3. Método y límites de la evaluación

La evaluación combina inspección estática del repositorio, decisiones arquitectónicas y búsqueda normativa. No se accedió a la base productiva, configuración del proveedor cloud, credenciales, equipos fiscales, respaldos externos ni expedientes administrativos. No se ejecutaron pruebas funcionales ni de penetración.

Estados usados: **base** significa que existe código o una capacidad parcial; **integración por verificar** exige demostrar el circuito completo; **no evidenciado** no equivale a inexistencia fuera del repositorio. No se asigna un porcentaje de cumplimiento sin inventario de requisitos y pruebas reproducibles.

## 4. Matriz inicial de brechas

| ID | Requisito de la referencia | Situación observada / alcance pendiente | Prioridad y evidencia de cierre |
| --- | --- | --- | --- |
| NOR-01 | Requisitos y solicitud de homologación | Referencia normativa requiere actualización; expediente legal externo no evaluado | P0: matriz de aplicabilidad revisada por responsable tributario, fuentes oficiales y modalidad seleccionada |
| FIS-01 | Facturas, notas de crédito y débito | Existe modelo de dominio con esos tipos, snapshots, conciliación de totales y evidencia de emisión; falta demostrar persistencia y emisión completa | P0: emitir, consultar, corregir y conciliar documentos con evidencia del canal real |
| FIS-02 | Integridad e inalterabilidad | El dominio restringe edición del documento emitido; eso no demuestra protección en BD, APIs o accesos privilegiados | P0: modificación y borrado rechazados; correcciones vinculadas; detección de alteraciones privilegiadas |
| FIS-03 | Corrección de operaciones confirmadas | El flujo heredado permite desconfirmar ventas y revertir movimientos; confirmar comercialmente no acredita emisión fiscal | P0: distinguir ambos estados y bloquear vuelta a borrador cuando exista emisión; corrección con documento y efectos compensatorios aplicables |
| AUD-01 | Bitácora de accesos, cambios, anulaciones, reimpresiones y correcciones | Hay observabilidad y trazabilidad en áreas concretas; no se ha demostrado una bitácora fiscal completa y protegida | P0: catálogo de eventos y pruebas de cobertura, integridad, exportación y permisos |
| TAX-01 | IVA, divisas y BCV | Existen dinero exacto, políticas tributarias versionadas y adaptador BCV; falta validar reglas reales y su uso en cada flujo | P0: casos aprobados por contador, vigencias y snapshots reproducibles |
| TAX-02 | Retenciones y tasas de servicio | Compras tiene salidas de retención IVA/ISLR; falta validar cobertura, vigencia y conciliación. Tasas de servicio hoteleras quedan condicionadas | P1: comprobantes, bases, ajustes y conciliación aprobados para el escenario objetivo |
| EMI-01 | Transmisión, validación y consulta fiscal | Contrato y modalidad por definir; no se ha acreditado transmisión fiscal operativa | P0: integración real, acuses, reintentos, consulta de estado y recuperación de resultado incierto |
| DEV-01 | Impresoras fiscales y cierres Z | Existe infraestructura de Device Bridge; no demuestra un adaptador fiscal operativo | P0 si se elige máquina fiscal: pruebas por modelo y firmware, cierres y conciliación |
| SEC-01 | Perfiles, permisos y fiscalización | Existen identidad y controles de acceso; permisos fiscales y segregación deben verificarse | P0: cajero, supervisor, soporte y auditor con mínimo privilegio y pruebas entre empresas |
| OPS-01 | Backups, conservación y continuidad | `db:backup` referencia un script ausente en esta copia del repositorio; configuración cloud no inspeccionada | P0: respaldo automatizado y restauración ensayada, incluyendo archivos y evidencias fiscales |
| FIN-01 | Caja, cuentas por cobrar y contabilidad | Ventas y pagos de suscripción no equivalen a un subsistema financiero comercial completo | P1: turnos, arqueos, anticipos, cobros, saldos y exportación o integración contable conciliados |
| CON-01 | Contabilidad | Existen cuentas, asientos, períodos, balance de comprobación e integraciones de nómina/compras; falta demostrar integración del nuevo circuito fiscal | P1: cada evento fiscal/financiero aplicable se contabiliza una sola vez, con reversos y conciliación |
| INV-01 | Compras e inventario | Capacidades existentes; validar circuito hotelero y relación con consumos | P1: consumos, devoluciones y mermas con movimientos únicos y costo conciliado |
| HOT-01 | Recepción, reservas y alojamiento | No acreditado como PMS completo en esta evaluación | P2: reserva, check-in, estancia, cambio de habitación y check-out con concurrencia controlada |
| HOT-02 | Habitación, A&B y facturación mixta | Requiere cuenta de estancia y vínculo con consumos, pagadores y documento fiscal | P2: hospedaje y restaurante cobrados o transferidos una sola vez, con trazabilidad |
| HOT-03 | Ocupación y ventas | Requiere modelo hotelero, fecha operativa y definiciones de indicadores | P2: ocupación, tarifa media e ingreso por habitación conciliados con operación |
| DOC-01 | Manuales, arquitectura, versiones y ambiente de prueba | Hay documentación técnica; falta paquete de evidencia de la versión liberada | P1: manuales probados por usuarios, entorno reproducible, versiones e informe de aceptación |

P0: bloquea una salida fiscal controlada. P1: necesario para operación administrativa confiable. P2: expansión hotelera condicionada a aceptación comercial del cliente. La prioridad no atribuye obligatoriedad legal.

## 5. Arquitectura objetivo

Conservar las fronteras existentes: `sales` representa el acuerdo comercial; `inventory`, el hecho físico; `fiscal`, el documento; `taxation`, las reglas; `monetary`, los importes y las tasas. Un documento fiscal no debe mover inventario por sí solo. Los pagos de suscripción de Kontave no deben reutilizarse como caja del hotel.

Incorporar, mediante decisiones arquitectónicas explícitas, las responsabilidades faltantes:

- **Emisión fiscal:** orquestación persistente, numeración según canal, solicitudes idempotentes, intentos y evidencia externa. Distinguir número interno, número fiscal y número de control cuando corresponda.
- **Auditoría:** actor autenticado, empresa, acción, entidad, instante UTC, fecha operativa, motivo, resultado, versión y correlación; campos sensibles restringidos y sin secretos.
- **Tesorería comercial:** caja, turnos, pagos, anticipos, reembolsos, cuentas por cobrar/pagar y conciliación.
- **Operación hotelera:** establecimiento, habitaciones, reservas, huéspedes, estancias, tarifas, cargos y cuentas de estancia. El huésped, ocupante, cliente fiscal y pagador pueden ser personas distintas.
- **Integración contable:** extender el módulo existente mediante contratos para asientos, cuentas y centros de costo; conciliar el circuito fiscal con los asientos y períodos, sin construir otro libro contable paralelo.

Los estados de entrega al proveedor no deben confundirse con los estados jurídicos del documento. Ante un timeout posterior a la emisión, registrar resultado incierto, consultar y conciliar antes de intentar una nueva emisión. La entrega puede repetirse; los efectos económicos y fiscales deben ser únicos.

Aplicar permisos de BD, restricciones y transacciones además de reglas de dominio. Una cadena de hashes sola no protege frente a quien puede reescribir toda la base: evaluar evidencias selladas fuera de esa frontera y almacenamiento con retención protegida según el riesgo y requisitos confirmados.

Reutilizar paquetes consolidados actuales. Los ADR antiguos contienen nombres históricos: el ADR 0039 documenta su convergencia. Nuevos cambios de Web requieren un corte explícito compatible con las instrucciones del repositorio; este plan no autoriza una migración general ni mover `app`, `src` o `public`.

## 6. Hoja de ruta por resultados

Las duraciones son rangos iniciales de planificación, no compromisos. Suponen dos ingenieros con dedicación, QA parcial, responsable de producto y disponibilidad semanal de contador/asesor tributario. La estimación se recalibra después del descubrimiento. Trámites, contratos y disponibilidad de hardware tienen plazos externos no incluidos.

| Fase | Trabajo y entregables | Responsable principal | Dependencia | Duración orientativa / salida |
| --- | --- | --- | --- | --- |
| 0. Alcance y aplicabilidad | Inventario de requisitos, fuentes oficiales, tipo de contribuyente, canal emisor, casos fiscales y empresa piloto | Producto + asesor tributario + arquitectura | Ninguna | 1–2 semanas; alcance y matriz de aceptación acordados |
| 1. Controles transversales | Persistencia fiscal, auditoría, permisos, respaldo/restauración, reglas y snapshots; migraciones compatibles | Backend + operación + QA | Fase 0 | 3–5 semanas; pruebas de integridad, aislamiento y restauración aprobadas |
| 2. Circuito fiscal completo | Una modalidad real; venta, impuestos, emisión, cobro básico, notas, reimpresión, consulta y conciliación | Backend + Web/Desktop según canal + QA | Fase 1 y contrato/equipo disponible | 4–6 semanas; circuito probado con fallos y evidencia externa |
| 3. Administración comercial | Caja y arqueos, cuentas por cobrar/pagar, anticipos, retenciones aplicables, reportes y enlace contable | Backend + presentación + contador | Fase 2; diseño financiero puede adelantarse | 3–5 semanas; cierre diario y conciliación sin diferencias inexplicadas |
| 4. Piloto y liberación del núcleo | Migración ensayada, formación, pruebas con administración/caja/contador, soporte, contingencia y evidencias por versión | Producto + QA + operación | Fase 3 | 2–4 semanas; acta de aceptación y criterios operativos cumplidos |
| H. Modo hotel opcional | Descubrimiento propio; reservas, habitaciones, tarifas, estancia, consumos, A&B y cierre nocturno; o integración equivalente con PMS | Producto hotelero + ingeniería + QA | Núcleo aceptado y ampliación contratada | Estimación y piloto separados después del descubrimiento |

Si todo se ejecuta secuencialmente, la suma orientativa para fortalecer y pilotar el núcleo es 13–22 semanas bajo los supuestos de equipo indicados. Un piloto fiscal acotado puede evaluarse al terminar la fase 2. La ampliación hotelera se cotiza y planifica por separado; no se incluyen PMS, channel manager, motor de reservas público ni todos los modelos de impresora en ese plazo.

## 7. Primer ciclo de trabajo: diez días hábiles

| Ventana | Resultado concreto | Responsable |
| --- | --- | --- |
| Días 1–2 | Elegir empresa piloto, contribuyente, canal fiscal y superficies; recopilar documentos reales anonimizados | Producto + contador |
| Días 2–4 | Matriz requisito → fuente → aplicabilidad → control → prueba → evidencia → versión; inventario de APIs, BD, dispositivos y proveedores | Arquitectura + asesor tributario |
| Días 3–5 | Demostrar los flujos existentes y marcar código conectado, parcial y ausente; revisar accesos privilegiados y respaldo real | Ingeniería + operación |
| Días 5–7 | Decisiones de persistencia fiscal, auditoría, contingencia, tesorería e integración; presupuesto de infraestructura y proveedor | Arquitectura + producto |
| Días 7–10 | Backlog estimado, casos de aceptación validados por responsables y primera historia de extremo a extremo lista para construir | Ingeniería + QA + contador |

Primera historia propuesta: registrar una venta de servicio, aplicar una regla tributaria vigente y una tasa histórica, emitir por un único canal, guardar su evidencia, registrar el cobro y emitir una nota de crédito vinculada. Repetir la solicitud y provocar un timeout no deben duplicar ni el documento ni el cobro.

## 8. Criterios de aceptación y pruebas críticas

Cada prueba debe conservar datos de entrada anonimizados, regla vigente, resultado esperado, resultado observado, versión, entorno y responsable. Los ejemplos tributarios los valida el contador; los fixtures del repositorio no demuestran vigencia legal. Las pruebas de habitaciones, hospedaje y cierre nocturno pertenecen exclusivamente a la ampliación opcional.

| Caso | Resultado exigido |
| --- | --- |
| Dos terminales emiten simultáneamente | Identidad y numeración únicas; operaciones completas, sin sobrescrituras |
| Reenvío de la misma operación | Un único documento, cobro y movimiento aplicable |
| Proveedor emite y la respuesta se pierde | Estado incierto visible, consulta posterior y conciliación; no reemisión ciega |
| Intento de editar o borrar emitido por API/BD | Rechazo para roles operativos; acceso privilegiado controlado y alteraciones detectables |
| Cambio de tasa o perfil tributario | Documentos anteriores idénticos; nuevos documentos aplican reglas por vigencia |
| Nota de crédito sin devolución física | Corrige el efecto fiscal/financiero aplicable sin crear stock ficticio |
| Devolución física y devolución de dinero | Hechos separados, vinculados y conciliables con la corrección fiscal |
| Reimpresión | Conserva identidad y contenido fiscal; bitácora con actor, motivo y resultado |
| Consulta de otra empresa | Denegada incluso manipulando identificadores o llamando directamente a la API |
| Fallo del almacén de auditoría | No se confirma silenciosamente una operación fiscal sin evidencia durable; recuperación documentada |
| Restauración en entorno aislado | Documentos, auditoría, archivos y saldos reconciliados; RPO/RTO medidos y aceptados |
| Venta mixta hospedaje + restaurante | Cargos, impuestos, pagos y centros de ingreso reconciliados sin duplicación |
| Anticipo, pago parcial, división de cuenta y reembolso | Se distinguen fondos recibidos, saldo y momento fiscal según política validada |
| Dos reservas concurrentes y cambio de habitación | Disponibilidad consistente y sobreventa solo bajo política explícita autorizada |
| Cierre nocturno repetido o interrumpido | Cargos no duplicados; fecha operativa preservada; reapertura autorizada y auditada |
| Cierre Z cuando aplique | Evidencia del dispositivo conciliada con caja/documentos; diferencias investigables |

La duración de conservación, RPO (pérdida máxima tolerable) y RTO (tiempo de recuperación) se fijan en fase 0 según obligación y operación. No basta una captura de un backup exitoso: se exige restauración ensayada. Un modo offline fiscal requiere diseño y aceptación específicos; no se presupone permitido ni incluido en el primer corte.

## 9. Anexo condicionado: cobertura hotelera futura

Este apartado conserva la trazabilidad con el documento recibido. Solo se activa si el cliente acepta el modo hotel; no debe generar implementación anticipada de reservas, habitaciones o restaurante dentro del núcleo.

El descubrimiento debe describir reservas individuales y de grupo, cancelaciones/no-show, tarifas por fecha, planes con alimentos, ocupación, habitaciones fuera de servicio, limpieza y cambios de habitación. Debe definir qué entra al piloto y qué se posterga expresamente.

La cuenta de estancia reúne cargos con origen y fecha operativa: alojamiento, restaurante, minibar y otros servicios. Se necesitan reglas de transferencia de cargos, pagadores múltiples, facturación a empresa, división de cuenta, cortes parciales y anticipos. El cierre nocturno debe ser repetible sin duplicar cargos y permitir gestionar estancias aún abiertas.

Para A&B, decidir si el primer corte integra un POS existente o incorpora comandas, mesas, recetas, mermas y consumos. El inventario actual no demuestra por sí solo una operación de restaurante completa.

Ocupación, ADR y RevPAR requieren definiciones aprobadas de habitaciones disponibles, noches vendidas e ingreso de alojamiento. No mezclar ingresos de restaurante con alojamiento sin una definición explícita del indicador.

## 10. Operación profesional y actualización continua

- **Registro normativo:** fuente, artículo, jurisdicción, vigencia, modalidad, interpretación, responsable y próxima revisión. Revisión mensual y ante publicación relevante.
- **Gobierno de reglas:** propuesta, revisión por contador, aprobación, fecha efectiva y versión; cambios sin recalcular documentos emitidos.
- **Liberaciones:** versión identificable, migración ensayada, pruebas críticas, matriz de compatibilidad, manuales y reversión técnica compatible con los datos emitidos.
- **Expediente de producto:** arquitectura, diccionario de datos, controles antifraude, flujos, manuales de usuario/soporte, restauraciones, incidentes y pruebas. Presentación formal solo cuando el trámite aplicable esté confirmado.
- **Acceso de auditoría:** acceso autorizado, limitado, temporal cuando corresponda y registrado; exportaciones verificables. No crear un acceso universal permanente por suponerlo exigido.
- **Continuidad:** alertas de emisiones pendientes, fallos de auditoría, antigüedad de respaldos y diferencias de conciliación; cada alerta con responsable y procedimiento.
- **Soporte:** severidades, canales, horarios y tiempos de respuesta acordados; contingencia y mantenimiento comunicados al hotel.
- **Seguridad:** revisión de privilegios, secretos y aislamiento; evaluación independiente antes de una operación fiscal comercial amplia.

Indicadores mínimos: duplicados fiscales detectados (objetivo 0), diferencias de conciliación no explicadas (0 al cierre), cobertura de eventos críticos (100% del catálogo aprobado), pruebas críticas aprobadas (100%), antigüedad de emisiones pendientes, restauraciones exitosas y tiempo de adaptación a cambios normativos.

## 11. Riesgos, costos y decisiones pendientes

| Riesgo / decisión | Tratamiento propuesto |
| --- | --- |
| Desarrollar contra normativa desactualizada | Cerrar NOR-01 antes de especificar trámites o transmisión |
| Confundir arquitectura disponible con operación lista | Demostración por circuito y evidencia, no por número de pantallas o paquetes |
| Dependencia de proveedor o dispositivo | Puerto de emisión, contrato de consulta/recuperación y pruebas por versión |
| Doble emisión por caída de red | Idempotencia durable, resultado incierto y conciliación externa |
| Alcance excesivo del hotel | Un hotel piloto y una modalidad fiscal; backlog explícito para siguientes cortes |
| Migración de documentos históricos | Preservar origen e identidad; importar y conciliar sin reemitir documentos |
| Cambio de proveedor a mitad de operación | Plan de portabilidad de documentos y acuses, sin renumerar historia |
| Presupuesto incompleto | Incluir ingeniería, QA, asesoría tributaria, equipo fiscal, proveedor digital, almacenamiento, backups, monitoreo, firma de instaladores si aplica, formación y soporte |

Decisión ya tomada: núcleo administrativo/fiscal primero y modo hotel condicionado. Pendientes de fase 0: modalidad y proveedor emisor; Web/Desktop/Mobile del piloto; número de empresas, establecimientos y cajas; conectividad esperada; alcance de integración con la contabilidad existente; equipo y presupuesto disponibles. PMS propio o integrado se decidirá dentro de la ampliación hotelera. No hay estimación monetaria responsable sin estas variables y cotizaciones.

## 12. Evidencia interna de partida

- [Documento fiscal implementado](../../packages/business/fiscal/src/domain/document.ts): tipos, snapshots, totales y evidencia de emisión.
- [Pruebas del documento fiscal](../../packages/business/fiscal/test/domain/fiscal-document.test.ts): cobertura de dominio existente; no ejecutada en esta evaluación.
- [ADR 0021](../adr/0021-fiscal-documents-domain.md), [ADR 0022](../adr/0022-versioned-taxation-and-venezuelan-policies.md) y [ADR 0024](../adr/0024-sales-dispatch-fiscal-and-pos-boundaries.md): fronteras fiscal, tributaria y comercial; nombres de paquetes históricos.
- [ADR 0039](../adr/0039-phase-3-web-package-convergence.md): consolidación de paquetes y cortes Web explícitos.
- [Estándar de observabilidad](../standards/observability.md): distingue incidentes de auditoría; los incidentes no sustituyen una bitácora fiscal.
- [Device Bridge](../../apps/device-bridge/README.md): infraestructura local y seguridad; no acredita por sí misma integración de impresora fiscal.
- [Comandos del proyecto](../../package.json): declaración `db:backup`; el archivo `scripts/backup-supabase.ps1` no se encontró en la copia inspeccionada.
- [Ventas y desconfirmación heredadas](../../supabase/migrations/211_sales_pos_channel.sql): confirmar, desconfirmar y efectos de inventario que requieren separación del estado fiscal.
- [Contabilidad existente](../../src/modules/accounting/backend/infrastructure/accounting-factory.ts): capacidades que se deben aprovechar y conciliar con la emisión fiscal.

Este plan añade únicamente documentación de trabajo. No modifica código, infraestructura, datos ni el documento original del usuario.
