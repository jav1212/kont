# ADR 0046: Cuentas por pagar a proveedores

- Estado: aceptado (código completo P0–P8, CXP-001 a CXP-031; pendiente de piloto)
- Fecha: 2026-10-23

## Contexto

Las compras compartidas no tienen un ciclo de deuda con proveedores. El modelo
de compras pertenece al inventario y no es una frontera adecuada para las
obligaciones que también pueden originarse en documentos manuales, notas,
importaciones y ajustes. CxP necesita operar en Web, Desktop y Mobile sin
arrastrar dependencias de inventario a sus consumidores.

El plan original proponía el número ADR 0045, pero ese número ya está ocupado
por el ADR de período fiscal de IVA. Por eso esta decisión usa el siguiente
número disponible.

## Decisión

Se crea `@kontave/payables` en `packages/business/payables`. El paquete posee
documentos de deuda y crédito, vencimientos, aplicaciones, giros, lotes, pagos,
retenciones al pago y sus consultas. Compras, Tesorería, Tributación y
Contabilidad se conectan por contratos y funciones propias de cada contexto;
CxP no escribe tablas de compras, tesorería ni contabilidad directamente.

Los documentos son hechos inmutables con principal, moneda, vencimiento y
snapshot de valuación, y un lado (`debit` aumenta lo adeudado; `credit` es un
crédito disponible: nota de crédito o ajuste negativo). El saldo se deriva del
principal menos las aplicaciones no reversadas; nada se borra: las correcciones
son reversos compensatorios. Cada comando se ejecuta en una transacción SQL con
alcance de tenant, organización y empresa, permiso verificado antes de reproducir
una respuesta idempotente, auditoría operacional y control optimista de versión.

### Decisiones de negocio (D1–D9)

1. **Compras que crean deuda (D1):** a crédito, y de contado no pagadas en el
   acto. Las históricas no se convierten en bloque; los saldos de apertura se
   cargan documento por documento con evidencia y sin efecto fiscal.
2. **Retenciones (D2):** en el primer evento entre abono en cuenta y pago. Las
   de la compra se importan como aplicaciones; al pagar solo se retiene cuando el
   pago es el primer evento. Retener al pagar una compra ya registrada se permite
   con advertencia de retención extemporánea, que queda auditada.
3. **Principal (D3):** subtotal + IVA + tributos dinámicos + IGTF guardado
   aparte. Las retenciones son aplicaciones separadas.
4. **Anticipos (D4):** fuera de alcance; un pago debe cubrir exactamente sus
   líneas y un sobrepago se rechaza.
5. **Moneda de la deuda (D5):** la de la factura con su tasa histórica.
6. **Lotes (D6):** propios de CxP; reservan saldo sin aplicarlo y se ejecutan una
   sola vez.
7. **Períodos (D7):** se usan los períodos contables de la empresa. Ningún hecho
   (salvo saldos de apertura) se registra en un período cerrado. Anular exige
   período abierto, movimiento no conciliado y retenciones no declaradas; reversar
   crea un hecho compensatorio con fecha propia.
8. **Autorización (D8):** política por empresa y versionada: separación
   preparador ≠ autorizador y umbral de ajustes negativos en Bs (desactivados por
   defecto). La aplican triggers SQL, no el cliente.
9. **Sucursal (D9):** los documentos heredan `branch_id` de la compra y las
   consultas filtran por sucursal; los pagos son por empresa.

### Conversión de monedas (decisión 4 del plan, corregida)

La fórmula del plan (`importe × tasa del pago ÷ tasa de la deuda` con la tasa
histórica de la deuda) aplica de más o de menos cuando la tasa cambió desde la
factura. La implementación convierte con las tasas de **la fecha del pago** de
ambas monedas: `aplicado = importe × tasa(moneda del pago) ÷ tasa(moneda de la
deuda)`, igual a uno cuando las monedas coinciden. El snapshot de la deuda solo
mide el diferencial realizado: `aplicado × (tasa actual − tasa histórica)` en
Bs, positivo para pérdida. `settlePayableCurrency` y `shared_payables_post_payment`
aplican la misma fórmula. Todas las tasas las resuelve el servidor con el mismo
BCV y política monetaria de Tesorería; el snapshot que envía un cliente se
descarta.

### Integración con Tesorería

`treasury_private.post_source_disbursement` y `reverse_source_disbursement`
pertenecen a Tesorería (migración propia) y se invocan dentro de la transacción
del pago: efectivo debita una caja (sin sobregiro), transferencia debita la
cuenta con referencia obligatoria y cheque emite el siguiente número de la
chequera con un único débito y el proveedor como beneficiario. Si Tesorería
rechaza (fondos, política de IDB, cuenta, chequera), no persiste ningún hecho de
CxP. Anular repone el desembolso y su IDB; reversar compensa con fecha propia y
conserva el IDB; el cheque se anula y su número no se reutiliza.

### Retenciones al pago

IVA (75 % o 100 % sobre el IVA del documento) e ISLR (concepto del Decreto
1.808; alícuota y sustraendo del catálogo, movido a `@kontave/taxation` y
compartido con Compras). Los correlativos se comparten con Compras
(`AAAAMM`+8 dígitos para IVA, `AAAA`+8 para ISLR) bajo un bloqueo por empresa,
tipo y período. Una retención IVA y una ISLR activas por documento como máximo.
Las declaradas son inmutables.

### Contabilidad (CXP-031)

`payables.payment_posted` es una fuente más de las reglas de integración y de su
configuración versionada (campos: pago, retención IVA, retención ISLR, pérdida y
ganancia cambiaria). Contabilizar crea un asiento en el período abierto y un pago
anulado o reversado recibe su asiento compensatorio. La consulta de conciliación
(`sin_asiento`, `contabilizado`, `diferencia`) se oculta mientras no haya reglas
activas.

## Límites y seguridad

Las tablas de CxP no admiten escritura directa por clientes; las RPC `SECURITY
DEFINER` solo las ejecuta `service_role` desde rutas autenticadas. El esquema
`treasury_private` no es accesible para roles de API.

CxP es un módulo de plataforma: todas las organizaciones tienen entitlement e
instalación (`platform_default`); la visibilidad depende de `payables.*`.

Corrección incorporada: una compra a crédito con retenciones propias puede
desconfirmarse; sus retenciones se reversan con ella y se reactivan al
reconfirmar sin duplicarse. Bloquean solo las aplicaciones de otros orígenes y
las reservas de lotes. Una nota de crédito fiscal mayor que la factura deja el
excedente como crédito disponible.

## Consecuencias

- Las fórmulas monetarias permanecen en `@kontave/monetary` y el reparto exacto
  de giros usa `allocateMoney` (residuo al último giro).
- El kernel expone `PayablesPort` (`client-contracts`, `client-remote`,
  `client-runtime`) clasificado `planned` en Web, Desktop y Mobile.
- Falta el piloto con usuarios reales (W1) y el recorrido manual en navegador.

## Evidencia

Migraciones (versiones remotas): `20261023140521`, `20261023140537`,
`20261023153431`, `20261023182105`, `20261023183249`, `20261023191047`,
`20261023191501`, `20261023191644`, `20261023192513`. Pruebas: PGlite
(`supabase/checks/payables-pglite.mjs`), PostgreSQL 17.5 real
(`scripts/test-payables-postgres.mjs`, 17 comprobaciones de concurrencia,
aislamiento y rollback) y paquetes (`@kontave/payables`, `@kontave/taxation`,
`@kontave/client-remote`). Validación en Supabase con transacciones revertidas y
comparación byte a byte de las funciones aplicadas.
