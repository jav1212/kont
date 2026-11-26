# Plan: diferencial cambiario de ventas financiadas (Cashea)

Fecha: 2026-11-21

## Contexto

La empresa vende a crédito a través de Cashea. Cashea paga de inmediato un
porcentaje de la venta (60% por defecto, vía punto de venta) y el resto (40%)
queda como cuenta por cobrar a Cashea, denominada de hecho en USD. Cuando
Cashea liquida ese saldo (≈14 días después), el banco recibe más bolívares que
los registrados en la cuenta por cobrar porque la tasa subió. Esa diferencia es
un **diferencial cambiario realizado** (otros ingresos, o egreso si la tasa
bajó).

### Ejemplo de referencia (01/10/2025)

| Concepto | Cálculo | Monto |
|---|---|---|
| Venta | — | Bs 7.455,25 |
| Equivalente USD | 7.455,25 / 179,43 | $41,55 |
| 60% cobrado (puntos) | 7.455,25 × 60% | Bs 4.473,15 |
| 40% a CxC | 7.455,25 − 4.473,15 | Bs 2.982,10 (≈ $16,62) |
| Cobro del 40% (banco) | dato real | Bs 3.992,47 |
| Tasa implícita | 3.992,47 / 16,6198 | 240,22 |
| **Diferencial** | 3.992,47 − 2.982,10 | **Bs 1.010,37** |

Asientos:

```
Venta:  D Banco 4.473,15 · D CxC Cashea 2.982,10 / H Ventas 7.455,25
Cobro:  D Banco 3.992,47 / H CxC Cashea 2.982,10 · H Diferencial cambiario 1.010,37
```

**Regla:** diferencial = Bs efectivamente cobrados − saldo de la CxC en Bs
históricos (tasa del día de la venta). El cobro real del banco es un dato de
entrada; la tasa implícita se deriva de él.

## Base existente reutilizable

- `packages/business/sales/src/domain/customer-receivable.ts` y
  `supabase/migrations/20260925192503_sales_credit_receivables.sql`: CxC con
  deuda en USD y snapshot de tasa al abrir y en cada cobro.
- Diferencial realizado/no realizado ya modelado en tesorería
  (`packages/business/treasury/src/domain/exchange-difference.ts`) y CxP
  (`packages/business/payables/src/domain/settlement.ts`).
- Cuenta especial `exchange_difference`
  (`20261026135757_accounting_settings.sql`, `accounting/settings/special-accounts`).
- Tasas BCV históricas vía `/api/bcv/*`.
- Asientos en borrador vía `POST /api/accounting/entries`.

## Fases

### Fase 1 — Detalle del diferencial a partir del Excel

1. Cálculo puro y probado en `@kontave/sales/domain`
   (`financed-sale-exchange-difference.ts`): venta, % de contado, tasa de la
   venta y cobros (totales o parciales) → contado, porción financiada en Bs y
   USD, tasa implícita, diferencial por cobro, saldo pendiente y líneas de
   asiento por rol (banco, CxC financiadora, ventas, diferencial).
2. Caso de uso en `@kontave/sales/application` que arma el reporte: tasa BCV de
   cada venta (puerto de historial de tasas), cobro real o estimado
   (fecha de venta + N días, tasa BCV de esa fecha), totales mensuales.
3. Importación del Excel de ventas (todas las hojas, formatos heterogéneos,
   fechas seriales o `dd/mm/aaaa`, ignora días en cero y totales, advierte
   fechas repetidas) y del archivo de cobros reales.
4. Endpoint aditivo `GET /api/bcv/range` para obtener tasas de un rango en una
   sola consulta.
5. Pantalla en Ventas → «Diferencial cambiario»: detalle diario, totales por
   mes, asientos propuestos, exportación a Excel.
6. (1b) Publicar los asientos en borrador en Contabilidad. Implementado:
   - Cada rol (banco, CxC financiadora, ventas, ganancia y pérdida cambiaria) se
     asigna a una cuenta de detalle del plan activo; ganancia/pérdida se
     precargan con la cuenta especial `exchange_difference` si existe. La
     asignación se recuerda por empresa en el navegador.
   - Los asientos se guardan como borrador vía `POST /api/accounting/entries`
     con `source = 'sales'` y `sourceRef = financed-sales:<daily|monthly>:<clave>`.
   - Republicar actualiza los borradores con la misma `sourceRef`; los asientos
     ya publicados (posted) no se tocan; las fechas sin período abierto se
     informan y se omiten.
   - Se bloquea publicar en un modo (diario/mensual) si ya existen asientos del
     otro modo, para no registrar los mismos hechos dos veces.
   - Los cobros estimados se excluyen de los asientos salvo que se marque lo
     contrario.
   - El origen `sales` se habilitó con la migración aditiva
     `20261121180000_accounting_entries_sales_source.sql`; como los demás
     orígenes de integración, queda exento de la validación de cuentas
     inactivas que aplica a los asientos manuales.

### Fase 2 — Libro Cashea persistente (implementado)

Decisión del usuario (2026-11-21): las ventas Cashea no se facturan en Kontave;
se cargan a mano (como el Excel) y debe ser fácil y práctico. Cashea liquida a
la tasa BCV del día del depósito; la comisión aún no se conoce (configurable,
0% por defecto).

1. Tablas aditivas `shared_financed_sales_settings`, `shared_financed_sales` y
   `shared_financier_deposits` (migración `20261121160000_financed_sales_ledger.sql`,
   verificada con `supabase/checks/financed-sales-ledger-pglite.mjs`). Cada fila
   guarda su tasa (BCV automática o manual).
2. Los depósitos no se asocian a mano: cada depósito se convierte a USD con la
   tasa BCV de su fecha (más la comisión, si existe) y se aplica FIFO a las
   ventas pendientes más antiguas anteriores al depósito
   (`allocateFinancierDeposits` en `@kontave/sales/domain`). Lo que exceda lo
   pendiente se informa como depósito sin aplicar.
3. `FinancedSalesLedger` (`@kontave/sales/application`) registra ventas y
   depósitos en lote, borra registros, guarda la configuración con control de
   versión y, tras cada cambio, sincroniza los asientos en borrador en
   Contabilidad (`AccountingFinancedSalesJournalSink`): crea o actualiza los
   borradores con `sourceRef = financed-sales:ledger:<granularidad>:<clave>`,
   borra los borradores huérfanos (acción nueva
   `deleteDraftEntryBySourceRef`, que nunca borra asientos publicados) y no toca
   los publicados. Se bloquea si hay asientos de la calculadora o de la otra
   granularidad, para no contabilizar dos veces.
4. `GET/POST /api/sales/financed-sales` (permisos `sales.read`/`sales.create`).
5. Pantalla «Libro Cashea» (pestaña por defecto en Ventas → Diferencial
   cambiario): registro rápido de venta del día (Enter guarda y avanza al día
   siguiente), registro de depósitos, pegado de filas desde Excel, importación
   del Excel de ventas sin duplicar, tablas, resumen mensual, estado de la
   sincronización contable y configuración de cuentas.

6. Edición de ventas y depósitos en línea (fecha, monto, tasa y referencia;
   tasa vacía = BCV de la fecha). Editar un depósito conserva su vínculo
   bancario; el botón «Desvincular» lo quita.

Fuera de alcance por la decisión anterior: dividir facturas emitidas en Kontave
en contado + CxC Cashea y guardar el diferencial por abono de CxC de facturas.

### Fase 3 — Revaluación y conciliación (implementado)

1. Diferencial no realizado al cierre de mes (opcional, apagado por defecto en
   la configuración del libro): el saldo pendiente en USD al último día de cada
   mes terminado se revalúa a la tasa BCV de ese día
   (`revalueFinancedSalesAtMonthEnds`). El ajuste se registra al cierre
   (D CxC / H ganancia, o D pérdida / H CxC) y se reversa el día 1 del mes
   siguiente, así el diferencial realizado del depósito no se cuenta dos veces.
   Usa cuentas propias (`unrealized_exchange_gain` y `unrealized_exchange_loss`,
   «Ganancia/Pérdida no realizada»), separadas de las del diferencial
   realizado; se exigen solo cuando existen asientos de revaluación.
   Los asientos usan las claves `revaluation:<mes>` y
   `revaluation_reversal:<mes>` y se sincronizan como los demás borradores.
2. Conciliación con Tesorería: desde el libro se eligen la cuenta bancaria en
   bolívares y el período; se leen los créditos publicados de Tesorería
   (`list_ledger_entries`), se sugieren vínculos por monto exacto y fecha a ±3
   días (`suggestFinancierDepositMatches`), se vinculan en lote y los créditos
   bancarios no registrados se pueden dar de alta como depósitos ya vinculados.
   Un movimiento bancario solo puede respaldar un depósito (índice único
   parcial). Migración aditiva `20261121170000_financed_sales_reconciliation.sql`.

### Cobros en divisas — implementado

Pestaña «Cobros en divisas» en Ventas → Diferencial cambiario. Importa la
plantilla de cobros (`fecha venta | dias | fecha recibo | monto | moneda | tasa`)
o el «Informe de I.G.T.F. Percibido» del sistema de facturación (una fila por
día en Bs; encabezado repetido por página; ignora títulos, notas y totales).

- Criterio del contador (2026-11-26): las divisas recibidas se usan para pagar
  facturas días después; SENIAT reconoce el diferencial entre la tasa BCV de la
  fecha de venta y la de la fecha de pago (ganancia o pérdida). Reemplaza la
  valoración al cierre de mes del 2026-11-25.
- Cada fila indica días o fecha de recibo (manda la fecha); si no trae ninguno,
  y siempre en el informe de IGTF, aplica «Días hasta el pago» (7 por defecto).
- Monto en USD: registrado = USD × tasa de venta. Monto en Bs (base del IGTF):
  USD = Bs ÷ tasa de venta, redondeado a centavos. La tasa de venta es editable.
- Diferencial = USD × tasa del recibo − registrado, también como % del
  registrado. Decisión del usuario (2026-11-26): los totales se agrupan por mes
  de pago (cuando se realiza el diferencial). Un recibo posterior al corte se
  valora provisionalmente al corte y queda en el mes de su fecha de pago.
- Cálculo en `valueForeignCurrencyCollection` (`@kontave/sales/domain`) y
  `BuildForeignCurrencyCollectionsExchangeDifferenceReport`
  (`@kontave/sales/application`); sin tablas nuevas ni asientos contables.
- Exporta a Excel el resumen mensual y el detalle diario.

## Decisiones pendientes con el usuario

1. ¿Cashea entrega reporte de liquidaciones (fecha y monto por orden o día)?
   Sin él solo existe el modo estimado.
2. Tasa con la que liquida Cashea: ¿BCV del día del cobro o propia? (El
   ejemplo implica 240,22.)
3. ¿60/40 fijo o variable por nivel de cliente? (Fase 1: configurable global y
   por fila.)
4. ¿Cashea descuenta comisión antes de depositar? Si sí, debe separarse del
   diferencial.
5. ¿Los montos del Excel incluyen IVA? (La hoja de julio dice «Montos Iva».)
6. Asientos por día o resumidos por mes. (Fase 1: ambos.)
