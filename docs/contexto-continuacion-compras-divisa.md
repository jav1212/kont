# Contexto de continuidad — compras julio 2026 y ajustes en divisa

Fecha: 2026-08-06
Repositorio: C:\Users\hmolina\Desktop\kont
Empresa: PANADERIA Y PASTELERIA LA MANSIÓN DE SUCRE, C.A.
RIF: J-29767818-2
Tenant Supabase: oficinakm11
Schema: shared mediante tablas/RPC `shared_inventory_*`
Documento principal: `docs/conciliacion-compras-julio-2026.md`

## Conciliación de compras

Se revisaron estos PDFs escaneados de los libros de compras:

- `C:\Users\hmolina\Downloads\ilovepdf_extracted-pages\CamScanner 8-6-26 11.26-2.pdf`
- `...\CamScanner 8-6-26 11.26-3.pdf`
- `...\CamScanner 8-6-26 11.26-5.pdf`
- `...\CamScanner 8-6-26 11.26-6.pdf`

Totales certificados por los PDFs:

- Primera quincena: Bs 1.718.592,14
- Segunda quincena: Bs 1.179.155,04
- Total julio: Bs 2.897.747,18
- Compras exentas: Bs 1.269.210,36
- Compras imponibles: Bs 1.403.911,97
- IVA compras: Bs 224.625,91
- Retención vendedor: Bs 173.060,45
- Alícuota: 16%

Hallazgos importantes:

- Falta el control `00-000456`, factura 456: total Bs 132.999,99.
- Falta el control `1757504`: total Bs 21.612,26.
- Faltan las notas de crédito `08-1211113` y `08-1211114`.
- El control `00-29620151` está registrado incorrectamente como factura positiva; en PDF es una nota de crédito.
- La factura `7072686326` existe como borrador aunque aparece en el PDF.
- No se ha ejecutado todavía la migración de datos de notas de crédito.

## Implementación previa

Ya existe la migración local y remota de tipos de documento:

- `supabase/migrations/163_shared_purchase_document_types.sql`
- Migración remota: `20260806162051_shared_purchase_document_types`

Se implementaron tipos:

- `factura`
- `nota_credito`
- `nota_debito`

También se actualizaron los KPIs de `app/(app)/purchases/page.tsx` para mostrar:

- Total compras con IVA
- Sin derecho a crédito
- Compras exentas
- Compras no sujetas
- Compras imponibles
- Alícuota
- IVA compras
- Retención vendedor
- Alícuota de retención

La clasificación corregida usa `vatAmount === 0` para exentas y `vatAmount !== 0` para imponibles, porque los registros existentes tienen `vat_percentage = 0` aunque poseen IVA.

## Cambio solicitado: descuentos, recargos e impuestos en USD

El usuario solicitó que en el formulario de factura los montos de:

- descuentos
- recargos
- impuestos adicionales

puedan ingresarse en Bs o USD.

La UX deseada es un único selector:

- %
- Bs
- USD

Cuando se selecciona USD:

- el monto escrito representa USD;
- se convierte a Bs usando la tasa BCV de la factura;
- el cálculo fiscal usa el equivalente en Bs;
- debería conservarse el monto original y la moneda.

Ejemplo esperado: si el descuento es USD 4,62 y la tasa es aproximadamente 514,9, el descuento debe ser aproximadamente Bs 2.379,30, no Bs 4,62.

## Archivos modificados para esta funcionalidad

- `src/modules/inventory/shared/totals.ts`
- `src/modules/purchases/backend/domain/purchase-invoice.ts`
- `src/modules/purchases/frontend/components/header-adjustments-section.tsx`
- `src/modules/purchases/frontend/components/factura-items-grid.tsx`
- `src/modules/purchases/frontend/components/invoice-taxes-section.tsx`
- `app/(app)/purchases/new/page.tsx`
- `app/(app)/purchases/[id]/page.tsx`
- `src/modules/purchases/backend/infra/repository/shared-purchase-invoice.repository.ts`

## Estado actual / problema pendiente

La funcionalidad de USD no está funcionando correctamente todavía.

El resumen sigue mostrando, después de seleccionar USD:

- Descuento: Bs 4,62
- Equivalente: $0,01

Esto significa que el cálculo aún está interpretando el valor como Bs o que el estado de moneda se está perdiendo antes de llegar a `computeInvoiceTotals`.

También se detectó que el panel lateral “Resumen” de `app/(app)/purchases/[id]/page.tsx` usa valores persistidos de `invoice`, mientras que el desglose principal usa `totals`. Se empezó a cambiar para que los borradores usen valores vivos.

## Puntos técnicos que deben revisarse antes de continuar

1. Revisar `header-adjustments-section.tsx`:
   - El selector debe actualizar `descuentoTipo: 'monto'` y `descuentoMoneda: 'D'` en una sola actualización.
   - Igual para recargos.
   - Revisar las interfaces `Props` y `RowProps`; durante los parches quedaron campos usados en runtime que no están declarados limpiamente.

2. Revisar `factura-items-grid.tsx`:
   - La misma lógica para descuentos y recargos por línea.
   - Confirmar que no quedaron literales `\`r\`n` dentro del código.
   - Confirmar que `AdjustmentCurrency` se importa desde `totals.ts`, no desde el dominio si no está exportado.

3. Revisar `invoice-taxes-section.tsx`:
   - El selector debe ser directamente %, Bs, USD.
   - Al elegir USD debe conservar `tipo: 'monto'` y `moneda: 'D'`.

4. Revisar `computeInvoiceTotals` en `totals.ts`:
   - `resolveAmount` debe convertir `valor * dollarRate` cuando la moneda sea D.
   - Confirmar que todas las llamadas pasan la tasa BCV.
   - Confirmar que los campos `descuentoMoneda` y `recargoMoneda` siempre tienen default B para registros antiguos.

5. Persistencia:
   - Actualmente la base compartida no tiene columnas para moneda de descuento/recargo.
   - El RPC existente probablemente ignora `descuentoMoneda` y `recargoMoneda`.
   - Para guardar correctamente la selección debe crearse una migración nueva para columnas de moneda en:
     - `shared_inventory_purchase_invoices`
     - `shared_inventory_purchase_invoice_items`
   - También debe actualizarse el RPC de guardado/confirmación o implementarse una persistencia segura posterior.
   - Los impuestos adicionales se almacenan en JSON, por lo que su campo `moneda` puede persistirse dentro de `taxes`.

6. Verificación:
   - Ejecutar `pnpm build` después de limpiar los parches.
   - El build llegó a compilar webpack pero falló varias veces en TypeScript por campos incompletos.
   - No ejecutar todavía la migración de datos de notas de crédito hasta estabilizar el formulario.

## Regla de negocio esperada

Para un ajuste fijo:

- Bs 4,62 => descuento Bs 4,62
- USD 4,62 con tasa 514,90 => descuento Bs 2.379,84
- El desglose debe mostrar ambos valores:
  - Bs 2.379,84
  - $ 4,62

El usuario pidió limpiar la sesión después de dejar este contexto.
