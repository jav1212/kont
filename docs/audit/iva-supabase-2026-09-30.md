# Validación de IVA mediante MCP de Supabase

Fecha: 2026-09-30. Proyecto verificado mediante `get_project_url`: `fvantswxhepvkloygcvc`. El MCP no permitió identificar inequívocamente su ambiente ni si es el destino de producción Web. Todas las consultas fueron de lectura. No se escribieron registros, ejecutaron migraciones ni hicieron pruebas con identidad de usuarios.

Este informe respalda el [plan de integración](../project/PLAN_INTEGRACION_IVA.md). La [evidencia JSON](iva-supabase-evidence-2026-09-30.json) conserva las consultas SELECT y sus respuestas MCP. Los conteos son una fotografía del proyecto conectado, no una afirmación sobre el despliegue productivo.

| Evidencia | Resultado | Consecuencia para el plan |
| --- | --- | --- |
| `migration` | Aplicadas `shared_purchase_retention_exports` (20260804135526), `product_pricing_taxation_insights` (20260816211412), puente de perfiles (20260816211716), servicios (20260927205746), fiscal (20260927211749), identificadores de servicios (20260927211759), revisión de borradores (20260928155709). | Extender estas capacidades y comprobar modificaciones posteriores; no recrear su esquema. |
| `schema`, `constraints` | Compras admite factura, nota de crédito y nota de débito; conserva referencia afectada, moneda, retención, importes y modo de cálculo. | Los casos correctivos ya tienen persistencia parcial aprovechable. |
| `rules` | Dos reglas IVA heredadas: 0 exento y 16 gravado, vigencia desde 2000 sin fin; fundamento pide revisión legal. | No considerar esos metadatos certificación normativa; no hay catálogo A1–A5 acreditado. |
| `rates` | Compras: 5 líneas reducida_8, 4.771 general_16 y 2.714 exenta. Ventas: 38 general_16 y 14 exenta. Sin bases nulas en estas líneas. | La tasa reducida histórica no está representada en el catálogo compartido actual. |
| `inventory` (consulta inicial) | Compras confirmadas: 1.796 facturas y 4 notas de crédito; ventas: 8 ventas y 21 notas de entrega. | Conteos de la primera fotografía; volver a consultar antes del corte. |
| `inventory`, `rpc` | Retenciones positivas en cabeceras: cero. La exportación usa 8/16, tipo documental 01 y documento afectado 0. | Defecto latente del lector Web que fija cero; falta validar con retenciones reales o fixtures posteriores, y cubrir notas en exportación. |
| `reconciliation` | Reproducción SQL de fórmula local del lector: diferencias mayores de un céntimo en 10 facturas y 4 notas; una factura sin líneas. | Investigar y clasificar diferencias antes del cambio de lector. No corregir importes automáticamente. |
| `periods` | Períodos atípicos 0003-05 y 2026-12, un documento cada uno. | Validación de fecha/período y revisión de datos de origen. |
| `fiscal` | Cero filas en `shared_fiscal_documents`. | Infraestructura disponible no equivale a operación fiscal migrada. |
| `objects`, `imports` | Tablas de importación de archivos; búsqueda de objetos relevantes no encontró un módulo nominal de declaración IVA/Forma 30. | Distinguir importación de archivo de importación aduanera. Diseñar declaración; no inferir ausencia absoluta por nombres. |
| `security`, `policies`, `grants`, `access` | RLS habilitado; políticas de compras/ventas por tenant y política barcode restrictiva. Fiscal sin privilegios directos de lectura/escritura para authenticated. | Mantener identidad derivada del servidor y probar aislamiento posteriormente. Grants aislados no demuestran acceso efectivo porque interviene RLS. |
| `rpc`, `constraints`, `indices`, `triggers` | RPC tributarias/fiscales inspeccionadas restringidas a service_role; validación empresa/organización; unicidad de origen e idempotencia, revisión positiva y triggers de ciclo de vida fiscal. | Reutilizar controles existentes; probar atomicidad, reintentos y concurrencia en fase de implementación. |

La comparación SQL reproduce la suma por alícuota y redondeo del lector local, con agregación por tenant e invoice. No ejecuta la página Web ni certifica la corrección legal de ninguna de las dos cantidades comparadas. Las consultas agregadas no muestran RIF, nombres, documentos de identidad ni identificadores de clientes.

La revisión de seguridad fue estática y focalizada. No se ejecutaron escrituras, simulaciones de usuarios ni pruebas de carreras. Tampoco se afirmó equivalencia completa entre todas las migraciones locales y remotas: se verificaron los objetos relevantes para el diagnóstico y se dejó el contraste integral del corte como requisito previo a su despliegue.

## Reconsulta al preparar el lector histórico

El 2026-09-30, antes de implementar el RPC de lectura, se repitió por MCP la consulta agregada de tipos confirmados. El resultado actual fue compras: 1.799 `factura` y 4 `nota_credito`; ventas: 8 `venta` y 21 `nota_entrega`. El total de facturas de compra difiere en tres de la fotografía inicial, por lo que se conserva la discrepancia temporal y se exige repetir conteos/cursor contra el ambiente objetivo. La consulta no expuso datos personales. Las notas de entrega siguen fuera del conjunto de facturas del RPC.

La segunda consulta de reglas confirmó únicamente IVA 16 gravado y exento 0, ambos desde 2000 sin fecha de fin, con fundamento explícito `requires legal catalogue review`. No se añadieron tasas ni se cambió la clasificación. El texto “Migrated production rule” describe el origen del registro; no permite identificar el ambiente del proyecto MCP ni certificar legislación vigente. No aplicar migraciones a ese proyecto hasta confirmar su ambiente y completar revisión de seguridad.

La consulta de tratamientos actuales encontró en asignaciones de productos solo `taxed` (9.026) y `exempt` (2.605), y en reglas compartidas una fila de cada uno. No devolvió filas de asignaciones de servicio. Esto es compatible con el `CHECK` aditivo propuesto, pero no valida aún la migración ni todos los objetos/constraints dependientes.

Revalidación previa a esta entrega: el MCP volvió a confirmar el historial sin las migraciones IVA 321–323, las reglas 16%/0% con revisión legal pendiente y los conteos de documentos confirmados (1.799 facturas y 4 notas de crédito de compra; 8 ventas y 21 notas de entrega). Los tipos de estado reales son `confirmada` y `borrador`; la lectura heredada debe filtrar por `confirmada`, no por la traducción inglesa `confirmed`. Los 11.631 perfiles de producto siguen clasificados únicamente como `taxed` o `exempt`. No se aplicaron migraciones ni se modificaron datos.

Las reglas fiscales vigentes requieren fuentes normativas oficiales y criterios de aceptación específicos. Supabase acredita el esquema y los datos observados, no su legalidad. La definición exacta de A1–A5, los créditos deducibles, importaciones aduaneras, periodicidad y Forma IVA 30 siguen siendo tareas del plan, no funcionalidades entregadas por este análisis.

## Revalidación de persistencia de declaraciones (2026-10-01)

Mediante MCP se ejecutó una consulta SELECT a `to_regclass`, `to_regprocedure` y al historial de migraciones para el ciclo nuevo. `shared_tax_reporting_declarations`, `shared_tax_reporting_facts`, `shared_tax_reporting_declaration_save(uuid,uuid,text,text,jsonb,uuid,text,integer)` y `shared_tax_reporting_declaration_list(uuid,uuid,text,uuid,text,text,integer,text,text,integer)` devolvieron `null`; el historial devolvió cero migraciones IVA de informes. La nueva lógica de presentación, pagos, anulación e historial existe únicamente en `packages/business/tax-reporting` y en la migración local 322. No se aplicó DDL ni se escribieron filas remotas.

## Revalidación de evidencia fiscal heredada por línea (2026-10-01)

Consulta SELECT mediante MCP a `information_schema.columns` confirmó en `shared_inventory_purchase_invoice_items` los campos `tax_amount`, `tax_type`, `tax_value` y `tax_concept`; `shared_inventory_sales_invoice_items` no tiene ninguno de esos cuatro campos. Una consulta agregada independiente comparó `shared_inventory_purchase_invoices.vat_amount` con la suma almacenada de `purchase_invoice_items.tax_amount` en documentos `confirmada`: 1.799 facturas, 1.062 con diferencia superior a 0,01; una factura no tenía líneas. Las sumas de impuesto por línea devolvieron mínimo y máximo 0,00. Las cuatro notas de crédito también difieren y sus cabeceras son negativas. Esta comparación usa los importes `tax_amount` persistidos, no la fórmula calculada a partir de tasa/base de la consulta previa; son señales distintas y ambas requieren investigación. No se infiere qué dato es correcto ni se promovieron hechos.

La misma reconsulta confirmó que el proyecto conectado no tiene las tablas `shared_tax_reporting_facts`/`shared_tax_reporting_declarations`, ni los RPC locales `read_iva_legacy_sources` y `shared_fiscal_document_record_issuance_with_tax_fact`. Las migraciones locales 322, 323 y 327 no se aplicaron. El paquete conserva los campos de compra para revisión y entrega nulos explícitos para la evidencia de impuesto por línea de ventas.

## Revalidacion del contrato de persistencia de conciliacion (2026-10-01)

Mediante MCP de Supabase se inspeccionaron columnas y `pg_constraint` antes de escribir la migracion de compras. `shared_companies` tiene clave primaria `(tenant_id, id)` y no posee unicidad para `(tenant_id, organization_id, id)`; `organization_id` es obligatorio en documentos fiscales, pero nullable en la tabla de companias. `shared_fiscal_documents` tiene PK `(tenant_id, id)`, FK `(tenant_id, company_id)` a companias y FK separada a organizaciones. `shared_inventory_suppliers` tiene PK `(tenant_id, id)` y FK a compania por `(tenant_id, company_id)`. Las membresias usan UUID para `organization_id` y `user_id`, y `status` textual; el agregado MCP devolvio 68 `active` y 2 `suspended`. Las tablas de delegacion no devolvieron filas, asi que el camino de delegados queda validado por esquema/codigo, no por registros observados en este proyecto. Los proveedores tienen `(tenant_id, id, company_id, rif, name, active)` y no hay tabla de match de factura.

Esta evidencia detecto que los FKs compuestos de las migraciones locales 322 y 334 no correspondian a ninguna clave unica remota. Se corrigieron para referenciar `(tenant_id, id)` de companias, manteniendo comprobaciones explícitas de organizacion en los RPC de alcance. La migracion 334 crea borradores de conciliacion y un RPC que en una unica transaccion inserta el hecho IVA, confirma el match y registra la clave idempotente; su segundo chequeo de idempotencia ocurre despues de adquirir el bloqueo de fila para cubrir reintentos concurrentes. MCP confirmo que el proyecto remoto todavia no contiene las tablas de reporte IVA y que las nuevas migraciones no se han aplicado. No se ejecuto DDL ni se leyeron datos personales para este contraste.


## Revalidación de emisión de venta con hecho IVA (2026-10-01)

Por MCP se volvió a comprobar la firma remota `confirm_native_sales_invoice_with_document_series_secure` (15 argumentos) y el esquema de la factura: incluye `updated_at`, `invoice_date`, `currency_code`, `subtotal`, `vat_amount`, `total` y `taxes`; `shared_fiscal_documents` conserva el snapshot JSON y eventos append-only. El RPC de hecho IVA y su tabla no aparecen en ese proyecto. Por ello el paquete `sales` usa una RPC aditiva local (migración 335) que envuelve el RPC existente y persiste número, documento e IVA dentro de la misma transacción. No se aplicó DDL remoto ni se asumió identidad del ambiente; quedan pendientes las pruebas SQL reales, incluida concurrencia y rollback.

La migración local de compras quedó numerada 336 para evitar colisión con `334_offline_sales_order_draft.sql`. La evidencia histórica que menciona 334 describe el cambio antes de resolver esa colisión.

## Revalidación de componentes tributarios (2026-10-01)

Las consultas MCP a `information_schema.columns` confirmaron que el proyecto conectado aún no tiene `tax_category`, `legal_component`, `legacy_rate_slot` ni `price_mode` en reglas/asignaciones de IVA. La lista de migraciones tampoco contiene la migración local 321 ni las migraciones locales de hechos y declaraciones. Esto valida el estado anterior al cambio, pero no una instalación; se conserva la compatibilidad para snapshots viejos con componente `base` y no se asignan alícuotas legales por A1–A5.

En los paquetes, la configuración Supabase, los lectores de reglas de producto/servicio, la resolución venezolana y el mapeo fiscal ahora preservan categoría, slot y componente. Check + 47 pruebas de `@kontave/taxation` y check + 26 pruebas de `@kontave/fiscal` pasan. Estas pruebas son locales y no acreditan el esquema, RLS ni la ejecución SQL remota.

## Revalidación del ciclo de libros y declaraciones (2026-10-01)

Consulta MCP de solo lectura a `to_regclass` y `to_regprocedure` devolvió `null` para las tablas `shared_tax_reporting_facts` y `shared_tax_reporting_declarations`, y para los RPC `shared_tax_reporting_fact_append(...)` y `shared_tax_reporting_declaration_save(...)`. No hay persistencia de hechos ni declaraciones en el proyecto conectado; no se aplicó DDL. Localmente, `PrepareVatDeclaration` ahora exige coincidencia de tenant, organización, empresa, período, identidad de hecho y linaje antes de calcular; valida moneda común para hechos, arrastre y ajustes y devuelve errores tipados ante inconsistencias. `@kontave/tax-reporting` pasó check y 34 pruebas, que son locales y no validan RLS ni transacciones PostgreSQL.

La validación MCP repetida confirmó que continúan ausentes las tablas y RPC locales de hechos y declaraciones IVA; por eso no hay hechos remotos que revalidar contra el nuevo criterio. El dominio `tax-reporting` ahora rechaza fechas no existentes en calendario, períodos que no coinciden con el mes de reconocimiento e instantes inválidos. Su check y 35 pruebas locales pasan; la validación remota de tablas, RLS y persistencia queda pendiente de aplicar el corte al proyecto autorizado.

## Idempotencia de administración tributaria y alcance MCP (2026-10-01)

Se corrigió la migración local 321: la tabla de idempotencia conserva snapshot de solicitud; los RPC de catálogo y perfil de contraparte serializan una clave con advisory transaction lock, repiten solamente la misma solicitud y rechazan payload distinto con `TAXATION_IDEMPOTENCY_CONFLICT`. La capa TypeScript mapea ese error tipado. `pnpm test:iva:taxation:sql` ejecutó la migración completa en PGlite desechable y verificó replay, payload cambiado, versión obsoleta y componente configurado; `@kontave/taxation` pasó check y 49 pruebas. MCP volvió a devolver null para ambos RPC y la tabla de idempotencia: el cambio solo existe localmente. PGlite no certifica concurrencia efectiva multi-sesión ni RLS/privilegios del Supabase conectado.
