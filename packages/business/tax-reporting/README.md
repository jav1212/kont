# @kontave/tax-reporting

Paquete de dominio y aplicación para libros y declaraciones internas de IVA. Sus
declaraciones son registros auditables del sistema; no constituyen una
certificación fiscal ni automatizan gestiones ante una autoridad.

## Ciclo de declaración IVA

`PrepareVatDeclaration` crea una revisión `prepared` solamente con hechos
conciliados del período. Desde allí, `ChangeVatDeclarationLifecycle` persiste
una nueva revisión inmutable mediante concurrencia optimista e idempotencia:

1. El comando `submit` registra `VatSubmissionEvidence` y pasa la declaración
   de `prepared` a `submitted`.
2. El comando `record_payment` registra un `VatPaymentEvidence` positivo, con
   referencia única y la misma moneda. Un pago parcial conserva el estado
   `submitted`; al completar exactamente el monto exigible, el estado pasa a
   `paid`.
3. El comando `void` sólo está disponible para una declaración `draft` o
   `prepared` que no tenga evidencia externa. Requiere evidencia de anulación
   independiente: motivo, fecha y actor. Una declaración enviada o con pagos no
   puede anularse por este flujo interno.

El paquete **registra** la referencia y la fecha de evidencia de una
presentación o pago ya realizados fuera de KONT; no presenta declaraciones ni
ejecuta pagos ante el SENIAT u otra autoridad. Las funciones de dominio públicas
son `submitVatDeclaration`, `recordVatDeclarationPayment` y
`voidVatDeclaration`; sus contratos usan `VatDeclaration`,
`VatSubmissionEvidence` y `VatPaymentEvidence`.

Web expone el historial interno en `GET /api/fiscal/iva/declarations`, la
preparación desde hechos conciliados en
`POST /api/fiscal/iva/declarations/prepare`, y las transiciones de evidencia en
`POST /api/fiscal/iva/declarations/[id]/lifecycle`. La API vuelve a leer la
revisión guardada por empresa/período, deriva el actor y scope desde el servidor
y usa control optimista de revisión. La pantalla `/fiscal/iva-declarations`
permite adjuntar referencia/fecha de presentación externa, registrar pagos ya
ejecutados o anular un borrador preparado. No automatiza gestiones con la
autoridad; la Forma IVA 30 oficial y la persistencia Supabase siguen pendientes
de un ambiente validado.

`ListVatDeclarationHistory` consulta esas revisiones por rango de período y
cursor estable `(period, id, revision)`. La persistencia vuelve a autorizar el
acceso de miembros y delegados que tengan alcance simultáneo de compras y
ventas. El resultado son snapshots internos; no incluye una constancia
SENIAT hasta que se incorpore una fuente oficial.

La preparación usa `VatFormTemplate` como una instantánea de plantilla interna.
El mapeo, llenado y renderizado oficial de la **Forma IVA 30** aún no están
implementados. Cualquier integración oficial debe construirse y validarse por
separado antes de tratar una declaración interna como una presentación legal.

## Fiscal document fact adapter

`fiscalDocumentTaxFact` maps the exact saved tax determinations of a finalized fiscal document into a historical reporting fact. `RecordFiscalDocumentTaxFact` persists it with explicit actor and idempotency metadata. It does not recalculate current rules; incomplete facts are marked for review. The purchasing package now has a match confirmation use case and a local RPC contract that commits the match with its received-invoice fact atomically. Its composition root is not yet connected, and the RPC/table migrations have not been applied to the MCP project. Sales still needs to invoke accepted issuance and fact persistence through its operational composition root.

For external issuance, `RecordIssuedFiscalDocumentTaxFact` accepts only a provider attempt in `accepted` state and writes the issuance attempt and VAT fact through one RPC transaction. Migration `338_iva_atomic_fiscal_issuance.sql` defines that RPC; its prefix avoids the existing `327_product_catalog_import_conflict_dedup.sql` version collision. The actual sales and purchasing composition roots must still route accepted documents through this command; the migration remains local until validated against a confirmed non-production Supabase environment.

`reviewLegacyVatSourceRecord` converts a page record from the legacy bridge to a historical fact only with explicit currency precision, exempt-base evidence, and reviewed rate groups. It preserves stored header and line totals, maps the legacy purchase retention amount and certificate when present, and requires a separately reviewed occurrence timestamp for non-zero retention. It flags absent line-tax evidence, rejects unsupported document kinds and missing document dates, and never recalculates tax using current rules. A fact marked `issue` remains excluded by declaration preparation until reconciled.

`RecordReviewedLegacyVatSource` obtains the selected legacy document through `LegacyVatSourceReader`, following the authorized, paginated date-range query before mapping it. It writes both reconciled and issue-marked facts with the authenticated reviewer and idempotency key. Declaration preparation continues to reject facts whose reconciliation state is `issue`.

The Web read endpoints `GET /api/fiscal/iva/legacy-purchase-sources` and `GET /api/fiscal/iva/legacy-sales-sources` require their respective book permissions, validate the company against the caller's organization, and return paginated raw source snapshots for review. They do not classify or record facts. The connected Supabase project currently lacks the migration 323 RPC, so these endpoints report the read capability unavailable there until the migration is exercised in an identified non-production environment. Sales lines intentionally carry no historical tax amount in that bridge; review must reconcile header evidence with a separately reviewed rate breakdown.

The corresponding `POST` endpoints require `purchases.confirm` or `sales.update` and an `Idempotency-Key`. `createSupabaseLegacyVatSourceReview` rereads the exact company/direction/date-bounded source through the package port, derives counterparty identity from that authorized snapshot, and appends an immutable fact through the actor-scoped append RPC. The request must provide an exact currency/precision, reviewed historical rate groups, exemption evidence, a recognition date, and—on purchases—deductibility evidence. Sales are assigned zero deductible purchase credit by the server. Facts with missing line tax or unexplained header differences remain marked for review and declaration preparation rejects them. Retries must reuse the same key and unchanged JSON body, including `recordedAt`.

`BuildVatLedger` returns historical rate groups separated by category, component, saved rule version, and currency, plus withholding groups separated by direction (`practiced` or `suffered`) and currency. It never combines different currencies or rule versions into one total. Withholding totals are derived only from the immutable facts on the returned page; callers must follow the cursor to aggregate a full date range.

The reporting persistence trigger also guards correction facts: credit notes, debit notes, and returns must reference an existing original invoice fact in the same tenant, organization, company, direction, and currency, and the original fact's source document ID must match the correction's independently read `affectedSourceId`. A correction cannot target itself, another correction, or an unrelated fact from the same book. At the database boundary it enforces each stored correction amount's sign and prevents credit notes and returns from cumulatively reversing more than the original invoice's signed base, tax, exempt amount, total, or deductible credit. It locks the original fact while checking that cap so concurrent corrections cannot exceed it together. The legacy purchase-source mapper copies the affected invoice ID from the read-only bridge; the fiscal-document mapper requires the affected internal document ID. Migration `362_iva_correction_fact_integrity.sql` also revokes direct table access from API roles so the scoped reporting RPCs remain the persistence boundary. The PGlite harness checks correction links, signs, cumulative caps, rejects direct `service_role` table reads, and confirms that its granted append RPC still works. These database checks remain local until a non-production Supabase environment is available. Legacy sales corrections remain unrecordable through the bridge while it returns no affected document ID.

Correction sign is part of the domain contract: credit notes and returns carry non-positive bases, tax, totals, breakdowns, and deductible credit; debit notes carry non-negative values. Legacy review applies that sign to the stored header magnitude and rate-group amounts without resolving or recalculating historical rates, and still marks unreconciled documents as issues. Domain and PGlite tests cover valid credit, debit, and return facts plus an invalid positive credit-note tax and invalid negative debit-note tax.

The server adapter `createSupabaseVatLedger` composes that action with the scoped reporting repository. Web exposes read-only pages at `GET /api/fiscal/iva/purchase-ledger` and `GET /api/fiscal/iva/sales-ledger`, requiring `purchases.read` and `sales.read` respectively and checking the company against the caller's organization before querying. They read only saved reporting facts and do not use the legacy inventory ledger's hard-coded rate reconstruction. These endpoints remain unavailable until the reporting migrations exist in the connected database.

The Supabase adapter maps PostgREST missing-function/table codes (`PGRST202`, `PGRST205`) and PostgreSQL missing relation/procedure codes (`42P01`, `42883`) to `TAX_REPORTING_UNAVAILABLE`. This distinguishes an environment without reporting migrations from malformed facts or an invalid user request.

## Import VAT facts

`RecordImportTaxFact` accepts only import facts in one of two explicit forms: goods customs declarations or foreign-service assessments. Goods require the declaration number/date, customs authority, tariff code, and payment evidence. Foreign services require the provider invoice reference, service date, payment evidence, and provider country. An import rate group classified as exonerated also requires a legal instrument and certificate reference. The command records the supplied historical amounts and classifications; it does not resolve rates, eligibility, customs relief, or deductible credit. Web exposes `POST /api/fiscal/iva/imports` with `purchases.confirm`, server-derived actor and company scope, and an `Idempotency-Key`. `/purchases/iva-imports` is the manual review screen; it reuses the same key and immutable fact body on network retries, leaves deductibility pending by default, and exposes remote persistence failures instead of treating them as success. Saving remains unavailable until the reporting append RPC is installed in the connected database.

`GetVatRetentionExport` reads the existing monthly withholding-export RPC through a service-role adapter after validating the tenant, company, and month. `buildVatRetentionTxt` renders its legacy tab-separated payload and `encodeVatRetentionTxtLatin1` provides bytes for a Web download adapter. The connected Supabase RPC currently forces document type `01`, affected document `0`, and calculates retention from base × rate × percentage rather than returning the stored invoice retention amount. Keep this export restricted to its established output until an additive database correction is reviewed and tested; package code does not certify that payload as an official SENIAT declaration.

## Resumen fiscal y período IVA

`GetVatPeriodSummary` devuelve totales y conteos para un período, separados por moneda, desde hechos fiscales inmutables y fuentes heredadas aún no incorporadas. La lectura heredada puede delimitarse por el `period` almacenado; si no se proporciona, conserva el contrato anterior de rango de fechas. El RPC aditivo `shared_tax_reporting_period_summary` respalda el resumen, y `read_iva_legacy_sources_period` consulta por período guardado sin cambiar la RPC existente.

`GetVatFiscalPeriod` y `ChangeVatFiscalPeriod` implementan el agregado auditable del período fiscal. La periodicidad no se infiere; una empresa sin configuración no puede preparar el período. Cada transición utiliza versión esperada e idempotencia, conserva actor/motivo y el período cerrado rechaza nuevos hechos. La persistencia Supabase usa la migración `20261023154113_vat_fiscal_periods.sql`, aplicada y validada en el entorno dev; producción sigue pendiente.

`GetVatPeriodicity` y `ConfigureVatPeriodicity` administran la periodicidad de la empresa (`monthly` o `fortnightly`). Empieza sin valor y nunca se infiere. Cada cambio usa la periodicidad esperada (compare-and-swap) e idempotencia, exige motivo cuando reemplaza un valor existente y queda auditado. Una vez que hay períodos registrados la periodicidad no puede cambiarse (`TAX_REPORTING_PERIODICITY_LOCKED`), porque las claves guardadas dejarían de corresponder. La migración `20261023160325_iva_company_configuration.sql` define las RPC `shared_tax_reporting_periodicity_read` (STABLE, `companies.read`) y `shared_tax_reporting_periodicity_set` (`companies.update`); Web las expone en `GET`/`PUT /api/fiscal/iva/periodicity`.

Web expone el resumen en `GET /api/fiscal/iva/period-summary`, la lectura/estado en `GET /api/fiscal/iva/periods?companyId=…&periodKey=…` y las transiciones en `POST /api/fiscal/iva/periods/[periodKey]/transition`. Los importes son cadenas de unidades menores con moneda explícita para evitar pérdida de precisión. Las migraciones están aplicadas y validadas en el entorno dev (objetos, permisos, RLS, trigger y advisors); producción sigue pendiente.

## Incorporación heredada por lote

`ReviewLegacyVatSourcesBatch` recibe hasta 100 fuentes seleccionadas con evidencia revisada por documento. Construye cada snapshot sin escribir; los hechos con conciliación pendiente quedan como rechazados con causa tipada y no pasan a persistencia. `TaxReportingFactBatchRepository.persistBatch` lleva los hechos elegibles al RPC `shared_tax_reporting_fact_append_batch`, que registra el comando idempotente y llama al append existente dentro de una única transacción. Un error SQL revierte todo el subconjunto elegible; una revisión con algunos documentos rechazados conserva resultados individuales sin hechos huérfanos.

Web expone el comando en `POST /api/fiscal/iva/legacy-sources/batch`. Requiere `purchases.confirm` o `sales.update`, scope de empresa validado, selección explícita y `Idempotency-Key`. La migración aditiva `20261023154126_iva_legacy_batch.sql` define el journal idempotente con RLS sin políticas y permisos solo para `service_role`; está aplicada y validada en el entorno dev; producción sigue pendiente. Las fuentes de compra con período manual conservan el campo `period` seleccionado también en el hecho fiscal, aunque difiera del mes de la fecha de reconocimiento.
