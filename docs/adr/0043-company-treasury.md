# ADR 0043: Tesorería empresarial portable y libro financiero compartido

Fecha: 2026-09-30. Estado: decisión de implementación; validación integral en curso.

## Contexto

El usuario solicitó implementar los 38 casos del [plan de tesorería](../project/PLAN_CAJA_BANCOS_TESORERIA.md) primero en `packages` y después consumirlos en la Web de producción. El catálogo original no define reglas detalladas. El código existente diferencia pagos de suscripciones (`payments`), intención administrativa (`payment-orders`) y cobros aplicados a deuda comercial (`sales`).

## Decisiones

- `packages/business/treasury` es un workspace `@kontave/treasury`. Posee maestros de cajas/bancos/cuentas/beneficiarios, hechos financieros, instrumentos, depósitos y conciliaciones. Los módulos de dominio, aplicación y adaptadores son internos. La presentación y los endpoints Web se integran posteriormente.
- Se reutiliza `@kontave/monetary` para cantidades exactas. Los contratos serializan importes y tasas como cadenas y retienen valor original y valoración VES. Cada snapshot conserva fecha, fuente, tasa, versión y redondeo. Las diferencias cambiarias son ajustes separados; no cambian el importe nativo de hechos históricos.
- Los comandos persistentes pasan por una RPC atómica de servidor, con actor autenticado, organización, empresa y tenant contrastados por SQL. Se verifica autorización en cada ejecución, incluso si el comando es un reintento. El recibo idempotente compara la intención canónica calculada en servidor y conserva el resultado de commit.
- La base operacional única usa tablas `public.shared_treasury_*`, RLS y helpers privados. La RPC controla referencias, versiones, bloqueos, unicidad, disponibilidad y auditoría en una transacción. No se envían callbacks por HTTP ni se simula una transacción con llamadas independientes.
- El catálogo de bancos es empresarial en esta primera implementación. Cada caja/cuenta tiene una moneda; el equivalente operativo está separado. Sobregiro bancario requiere configuración explícita; cajas no lo permiten. Aperturas se registran como hechos identificados y documentados, no como un saldo editable.
- Crédito incrementa el saldo del titular empresarial y débito lo reduce. Borradores no cuentan. Un movimiento confirmado es inmutable; un reverso agrega un hecho compensatorio con fecha propia, motivo y enlace al original. Cierres impiden alteración retroactiva. Un reverso no puede violar la disponibilidad del saldo resultante.
- Los cheques aquí modelados son emitidos. La emisión produce un único débito en libros; entrega/desmarcado registran hechos de custodia sin duplicarlo. Folios anulados no se reutilizan. Cheques conciliados requieren resolver la conciliación antes de alterar su ciclo financiero. No se afirma que se haya enviado una transferencia a un banco.
- **Confirmación explícita del usuario:** cancelar una orden significa anularla; pagar es otra acción. `payment-orders` conserva sus estados administrativos existentes. Treasury posee evidencia de ejecución única y bloquea edición, cancelación y eliminación de órdenes ejecutadas. La consulta compuesta muestra `unpaid/paid/cancelled`, importe pendiente y movimiento asociado. La primera ejecución es total; parciales requieren extensión explícita del contrato.
- Un depósito enlaza cobranzas de Sales y mueve su disponibilidad financiera. No aplica un segundo pago a la deuda del cliente. La transacción valida empresa, moneda, reversos y asignaciones previas antes de consumir la cobranza; jamás confía en un monto declarado por el cliente como evidencia de cobro.
- Extractos se importan mediante un formato neutral y una identidad externa. La conciliación inicial utiliza enlaces uno a uno; cualquier ambigüedad queda pendiente. Las reglas son versionadas, con ventana temporal y tolerancia explícitas. Relaciones múltiples necesitan una extensión que conserve importes y asignaciones, no coincidencias automáticas arbitrarias.
- La política tributaria es versionada y empresarial en `taxation`, con cálculo exacto, evidencia y exclusión autorizada. IDB histórico e IGTF son conceptos diferentes. No hay una tasa universal implícita. La [investigación tributaria](../audit/tesoreria-tributos-venezuela-2026-09-30.md) documenta alcance de las fuentes y políticas de referencia; configurar una regla no significa ejecutar una declaración fiscal.
- El kernel publica contratos serializables y composición del feature; las plataformas lo clasifican `planned` hasta tener una presentación implementada y validada. Esa clasificación no habilita operaciones ni rutas productivas.

## Consecuencias y aceptación

Las invariantes que dependen de datos persistidos se verifican en SQL además de las validaciones portables. Pruebas del dominio o mocks no demuestran aislamiento, atomicidad o carreras: se requiere integración SQL y, para carreras, conexiones PostgreSQL independientes. Se preservan las migraciones previas y se agregan nuevas.

La aceptación completa sigue la matriz TES del plan. Hasta verificar sus 38 filas, reportes, seguridad y persistencia, el conjunto permanece en implementación. Las reglas empresariales elegidas arriba son decisiones explícitas del primer contrato; no se presentan como especificaciones recuperadas del funcionamiento interno de Profit Plus. La activación productiva requiere configuración legal y monetaria válida para cada empresa y un corte Web posterior con datos conciliados.
