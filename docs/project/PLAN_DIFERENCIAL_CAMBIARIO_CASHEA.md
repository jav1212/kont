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
     con `source = 'manual'` (la restricción de la tabla no admite otro origen
     todavía) y `sourceRef = financed-sales:<daily|monthly>:<clave>`.
   - Republicar actualiza los borradores con la misma `sourceRef`; los asientos
     ya publicados (posted) no se tocan; las fechas sin período abierto se
     informan y se omiten.
   - Se bloquea publicar en un modo (diario/mensual) si ya existen asientos del
     otro modo, para no registrar los mismos hechos dos veces.
   - Los cobros estimados se excluyen de los asientos salvo que se marque lo
     contrario.
   - Pendiente para Fase 2: origen propio `sales` en
     `shared_accounting_entries_source_check` (migración aditiva) y publicación
     desde el servidor.

### Fase 2 — Flujo operativo

1. Registrar a Cashea como cliente financiador; al confirmar una venta Cashea,
   dividir en contado + CxC en USD (CxC existente).
2. Calcular y persistir el diferencial realizado en cada cobro
   (columna aditiva `realized_exchange_difference` en
   `shared_sales_receivable_payments`).
3. Regla de `accounting-integration` para ventas/cobros que contabilice
   automáticamente, como en compras.

### Fase 3 — Opcional

- Conciliación de depósitos Cashea en Tesorería.
- Diferencial no realizado al cierre de mes sobre CxC Cashea abiertas.

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
