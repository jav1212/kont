# ADR 0045: Período fiscal de IVA

- Estado: aceptado
- Fecha: 2026-10-22

## Contexto

Los libros y las declaraciones del IVA necesitan una identidad de período común,
independiente de la paginación de los hechos. Hoy el reporte guarda `period` en
cada hecho y las declaraciones tienen un ciclo de vida, pero no existe un
agregado que registre la revisión y cierre del período fiscal de una empresa.
La periodicidad debe proceder del perfil fiscal vigente de esa empresa; no se
puede deducir ni establecer por defecto.

## Decisión

Se introduce `VatFiscalPeriod` en `@kontave/tax-reporting`, identificado por
`(tenantId, organizationId, companyId, periodicity, periodKey)`. Las claves son
`YYYY-MM` para periodicidad mensual y `YYYY-MM-Q1` o `YYYY-MM-Q2` para
periodicidad quincenal. El agregado persiste transiciones y sus eventos; los
conteos y montos permanecen derivados de hechos inmutables y no se guardan como
saldos mutables.

Las transiciones válidas son `Abierto → En revisión → Preparado → Declarado →
Pagado → Cerrado`. Antes de declarar, una reapertura requiere motivo, actor,
versión esperada e idempotencia. `Preparado` referencia la revisión vigente de
la declaración. `Declarado` y `Pagado` deben corresponder al ciclo existente de
declaraciones. Un período cerrado impide nuevos hechos con esa clave y las
correcciones se registran en el siguiente período abierto según la política de
hechos correctivos existente.

El período previo y su declaración determinan el excedente arrastrado. Solo se
permite informar el excedente inicial manualmente cuando Kontave no tiene un
período anterior para esa empresa, y se exige motivo. La ausencia de periodicidad
produce el pendiente bloqueante «Periodicidad no configurada» y prohíbe preparar
la declaración.

La persistencia se agrega en tablas con RLS activo y sin políticas ni grants a
`anon`/`authenticated`; la lectura y las transiciones usan RPC `SECURITY
DEFINER` con ejecución limitada a `service_role`. Ninguna migración se aplica a
producción sin confirmación explícita del usuario y verificaciones de seguridad
antes y después.

## Consecuencias

- La UI usa el período fiscal como contexto de URL y los conteos de libros son
  de período completo, no sumas de páginas.
- La fuente de periodicidad debe estar configurada antes de preparar períodos.
- Eventos de transición son auditables e idempotentes; el estado actual no
  sustituye a los hechos tributarios.
- La interfaz no muestra fecha de vencimiento si no hay calendario SENIAT
  verificable configurado.
- La vista de declaración se denomina «Resumen de autoliquidación» y permanece
  identificada como borrador interno; no representa la Forma IVA 30 oficial.

## Fuera de alcance

Este ADR no define tasas, deducibilidad, exoneraciones, calendario de
vencimientos ni el contenido de una forma oficial. Tampoco migra ni promueve
automáticamente documentos heredados existentes.
