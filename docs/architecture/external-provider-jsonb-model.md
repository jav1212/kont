# Modelo JSONB para integraciones y sistemas heredados

## Estado

- Tipo: propuesta de arquitectura
- Bounded context: Integraciones
- Persistencia flexible: PostgreSQL `JSONB`
- Objetivo: soportar D3xD y futuros proveedores sin contaminar los dominios de Kontave

## Aclaración de tecnología

En esta arquitectura se utilizará `JSONB`, el tipo documental binario de PostgreSQL y Supabase. No se utilizará BSON ni se introducirá MongoDB solamente para almacenar datos de proveedores.

`JSONB` permitirá conservar el documento original y versionado de cada sistema externo. No será la única representación ni la fuente operacional de los dominios de Kontave.

## Problema

Kontave deberá integrarse progresivamente con sistemas como D3xD, Saint, Profit Plus, Odoo u otros. Cada proveedor presenta nombres, tipos, relaciones y comportamientos diferentes. Además, algunos clientes necesitan conservar información histórica de sus sistemas anteriores aunque Kontave todavía no modele todos sus conceptos.

Agregar campos específicos de cada proveedor a `Product`, `Invoice`, `Customer` o `Movement` contaminaría el dominio, dificultaría el gran refactor y convertiría cada nueva integración en una modificación transversal.

## Decisión propuesta

Crear un bounded context de Integraciones que actúe como capa anticorrupción entre sistemas externos y los dominios de Kontave.

Cada registro tendrá tres representaciones claramente separadas:

1. registro original del proveedor;
2. contrato canónico de integración;
3. entidad o comando del dominio de Kontave.

```text
D3xD ───────┐
Saint ──────┼──► Integraciones ──► contrato canónico ──► dominios de Kontave
ProfitPlus ─┘        │
                     └── documento original JSONB
```

El documento original pertenece a Integraciones. Productos, Inventario, Ventas y Contabilidad no importarán tipos ni adaptadores de proveedores.

## Principios

- El proveedor se modela en el borde, no en el dominio interno.
- Se conserva el dato original antes de transformarlo.
- Los contratos canónicos se definen por capacidad, no como un objeto universal.
- La proyección al dominio es explícita, versionada e idempotente.
- Las identidades externas se vinculan con identidades internas estables.
- Los datos históricos pueden permanecer consultables sin convertirse en entidades editables.
- Campos consultados frecuentemente tienen columnas e índices propios.
- Archivos grandes no se guardan dentro de JSONB.
- La integración depende de puertos de aplicación; los dominios no dependen de Integraciones.

## Modelo de persistencia

Los nombres son preliminares y deberán alinearse con las convenciones definitivas del esquema compartido.

### Conexiones externas

```sql
CREATE TABLE integration_connections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  company_id uuid NOT NULL,
  provider text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

`configuration` contendrá opciones no sensibles, capacidades, versión detectada y referencias a secretos. Contraseñas y tokens no se almacenarán como texto dentro del JSONB.

### Registro externo actual

```sql
CREATE TABLE integration_external_records (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES integration_connections(id),
  entity_type text NOT NULL,
  external_id text NOT NULL,
  external_code text,
  payload_schema_version integer NOT NULL,
  raw_payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  status text NOT NULL,
  UNIQUE (connection_id, entity_type, external_id)
);
```

Esta tabla representa la última versión observada. La unicidad se basa en conexión, tipo e identidad externa, no únicamente en un código comercial mutable.

Ejemplo de `raw_payload` D3xD:

```json
{
  "codigo": "ABC123",
  "descripcion": "Martillo profesional",
  "referencia": "7591234567890",
  "precio1": "25.50",
  "precio2": "23.00",
  "impuesto": "G",
  "departamento": "FERRETERIA",
  "existencia": "42.000"
}
```

El documento se conserva con los nombres y valores originales. No se modifica para hacerlo parecer una entidad de Kontave.

### Versiones del registro

```sql
CREATE TABLE integration_external_record_versions (
  id uuid PRIMARY KEY,
  external_record_id uuid NOT NULL REFERENCES integration_external_records(id),
  source_version text,
  payload_schema_version integer NOT NULL,
  raw_payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  observed_at timestamptz NOT NULL,
  UNIQUE (external_record_id, payload_hash)
);
```

Esta tabla append-only permite auditar cambios. Si el volumen resulta elevado, se definirán políticas de retención, particionado o almacenamiento frío. No se conservarán copias idénticas gracias a la huella única.

### Vínculos con el dominio

```sql
CREATE TABLE integration_entity_links (
  connection_id uuid NOT NULL REFERENCES integration_connections(id),
  entity_type text NOT NULL,
  external_id text NOT NULL,
  domain_entity_type text NOT NULL,
  domain_entity_id uuid NOT NULL,
  mapping_version integer NOT NULL,
  last_projected_hash text,
  last_projected_at timestamptz,
  PRIMARY KEY (connection_id, entity_type, external_id)
);
```

Ejemplo:

```text
D3xD product 18492 ↔ Kontave product 97a12c4e-...
```

### Ejecuciones y errores

El contexto también será propietario de:

- `integration_sync_runs`: ejecución completa o incremental;
- `integration_sync_items`: resultado por registro;
- `integration_checkpoints`: cursor por conexión y capacidad;
- `integration_dead_letters`: operaciones que agotaron reintentos;
- `integration_mapping_rules`: equivalencias configurables cuando proceda.

Todas las tablas estarán aisladas por tenant, organización y empresa según corresponda, con RLS y autorización explícita.

## Columnas frente a JSONB

No se esconderá todo en un único documento. Los datos necesarios para identidad, seguridad, filtrado frecuente y operación tendrán columnas normales.

```text
Columnas normales
├── tenant y conexión
├── tipo de entidad
├── external_id y external_code
├── fechas de origen y observación
├── estado
└── hashes y versiones

JSONB
├── representación completa del proveedor
├── atributos variables
├── campos aún no interpretados
└── extensiones específicas de versión
```

Los índices JSONB se agregarán únicamente para consultas demostradas. No se creará un índice GIN global por costumbre si el patrón de consulta puede resolverse con columnas específicas.

## Contratos canónicos por capacidad

No se diseñará un `UniversalERPRecord` que reúna todos los campos posibles. Se crearán contratos pequeños y semánticos.

### Producto

```ts
export interface ExternalProductSnapshot {
  readonly externalId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly barcodes: readonly string[];
  readonly category: ExternalCategoryReference | null;
  readonly baseUnit: CanonicalUnitOfMeasure;
  readonly status: "active" | "inactive";
  readonly observedAt: string;
}
```

### Precio

```ts
export interface ExternalProductPriceSnapshot {
  readonly externalProductId: string;
  readonly priceList: string;
  readonly amount: string;
  readonly currency: string;
  readonly taxIncluded: boolean;
  readonly observedAt: string;
}
```

### Tributación

```ts
export interface ExternalProductTaxSnapshot {
  readonly externalProductId: string;
  readonly taxCode: string;
  readonly treatment: "taxed" | "exempt" | "exonerated" | "unknown";
  readonly observedAt: string;
}
```

### Movimiento de inventario

```ts
export interface ExternalInventoryMovement {
  readonly externalMovementId: string;
  readonly externalProductId: string;
  readonly type: string;
  readonly quantity: string;
  readonly occurredAt: string;
  readonly rawReference: string | null;
}
```

Precios, impuestos y existencia no se incluirán dentro de una entidad de producto gigante. Cada capacidad conserva reglas, versiones y casos de uso propios.

## Adaptadores por proveedor

Cada proveedor tendrá contratos de entrada y mapeadores propios. Una organización preliminar compatible con el monorepo es:

```text
packages/
  integrations/
    domain/
    application/
    contracts/
    supabase/
    node/
    d3xd-contracts/
    d3xd-mysql/
    d3xd-mapper/
    saint-contracts/
    saint-adapter/
    profit-plus-contracts/
    profit-plus-adapter/
```

La estructura exacta puede compactarse mientras existan pocos proveedores, pero deben mantenerse las fronteras. No se creará un módulo genérico `utils`, `helpers` o `shared` para acumular conocimiento específico.

Ejemplo:

```ts
export class D3xDProductMapper {
  map(record: D3xDRawProduct): ExternalProductSnapshot {
    // Único lugar que conoce nombres y peculiaridades de D3xD.
  }
}
```

```ts
export class SaintProductMapper {
  map(record: SaintRawProduct): ExternalProductSnapshot {
    // Único lugar que conoce nombres y peculiaridades de Saint.
  }
}
```

## Dirección de dependencias

Integraciones orquesta proyecciones mediante puertos de aplicación:

```text
Integraciones ──► Productos application
Integraciones ──► Pricing application
Integraciones ──► Taxation application
Integraciones ──► Inventory application

Productos   ──X──► Integraciones
Pricing     ──X──► D3xD
Inventory   ──X──► Saint
```

Los dominios internos no conocen proveedor, payload, conexión ni mecanismo de transporte.

Un servicio de proyección puede coordinar los puertos:

```ts
export class ProjectExternalProduct {
  constructor(
    private readonly products: ProductCatalogPort,
    private readonly pricing: ProductPricingPort,
    private readonly taxation: ProductTaxationPort,
    private readonly links: ExternalEntityLinkRepository,
  ) {}
}
```

## Flujo de ingestión

1. El adaptador lee un registro del proveedor.
2. El agente conserva una copia mínima en su outbox local.
3. La API recibe un sobre versionado e idempotente.
4. Integraciones persiste el documento original JSONB.
5. El mapeador específico crea el contrato canónico.
6. Se validan equivalencias y reglas.
7. El servicio de proyección invoca casos de uso del dominio.
8. Se actualiza el vínculo externo/interno.
9. Se registra éxito, omisión, conflicto o error.

Persistir el original antes de proyectar permite corregir un mapeador y reprocesar registros sin volver a consultar el sistema antiguo.

## Sobre idempotencia

El sobre de ingestión incluirá como mínimo:

```ts
export interface ExternalRecordEnvelope {
  readonly connectionId: string;
  readonly provider: string;
  readonly entityType: string;
  readonly externalId: string;
  readonly payloadSchemaVersion: number;
  readonly sourceHash: string;
  readonly observedAt: string;
  readonly rawPayload: unknown;
}
```

Llave sugerida:

```text
{provider}:{connectionId}:{entityType}:{externalId}:{sourceHash}
```

El mismo documento puede recibirse múltiples veces sin crear versiones ni entidades duplicadas.

## Versionado del proveedor y del mapeo

Se distinguirán:

- versión del producto externo;
- versión del esquema de payload;
- versión del mapeador;
- versión del contrato canónico;
- versión de la entidad interna cuando tenga concurrencia optimista.

Ejemplo:

```json
{
  "provider": "d3xd",
  "entityType": "product",
  "payloadSchemaVersion": 2,
  "mapperVersion": 3
}
```

Una actualización de D3xD podrá incorporar `D3xDProductMapperV2` sin alterar el dominio de Productos ni hacer ilegibles registros antiguos.

## Historial de sistemas anteriores

Se distinguirán dos destinos.

### Datos operacionales

Se proyectan a dominios de Kontave cuando existe una necesidad actual:

- productos activos;
- categorías;
- clientes y proveedores necesarios;
- saldos iniciales autorizados;
- movimientos y documentos requeridos.

### Archivo histórico externo

Permanece en Integraciones, en modo consulta:

- facturas cerradas;
- documentos antiguos;
- campos exclusivos del proveedor;
- configuraciones propietarias;
- registros que Kontave todavía no interpreta.

Una factura histórica de D3xD no se convierte automáticamente en una factura editable de Kontave. Puede mostrarse como un registro externo de solo lectura con procedencia y payload original.

## Archivos y payloads grandes

PDF, XML, imágenes, respaldos y adjuntos no se almacenarán dentro de JSONB. Se guardarán en object storage con:

- tenant y conexión propietarios;
- hash de integridad;
- tipo MIME;
- tamaño;
- fecha de origen;
- referencia desde el registro JSONB.

También se definirán límites de tamaño para payloads, profundidad y cantidad de claves antes de aceptar datos externos.

## Seguridad y privacidad

- Aplicar RLS por tenant y autorización por organización/empresa.
- No persistir contraseñas, tokens, certificados ni secretos dentro de `raw_payload`.
- Sanitizar el payload antes de observabilidad y logs.
- Permitir retención y eliminación conforme al ciclo contractual del cliente.
- Registrar quién vinculó, reprocesó o consultó información sensible.
- Minimizar la información ingerida según la capacidad contratada.
- No utilizar credenciales administrativas del proveedor en servicios cloud.

El archivo histórico puede contener información más sensible que el dominio operativo. Su acceso debe ser una capacidad explícita, no una consecuencia de poder consultar productos.

## Estrategia frente al gran refactor

Para evitar trabajo desechable:

- El bounded context de Integraciones se implementará en paquetes nuevos.
- La aplicación local será un composition root y adaptador, no propietaria del dominio.
- Las rutas actuales de Next.js serán adaptadores delgados y aditivos mientras continúe el freeze de Web.
- Los tipos D3xD no entrarán en el módulo legacy de inventario.
- Las proyecciones utilizarán los casos de uso de la nueva arquitectura.
- Las aplicaciones Desktop, Mobile, Web y Local Agent no se importarán entre sí.
- Los contratos TypeScript mantendrán imports sin extensiones.

Esta separación permite reemplazar Web, Desktop o el mecanismo de transporte sin rediseñar el modelo de integración.

## Decisiones que deben resolverse antes de implementar

- Retención exacta de versiones JSONB por plan y cliente.
- Capacidades iniciales además de productos.
- Política de almacenamiento frío y exportación del archivo histórico.
- Catálogo de proveedores y versiones soportadas.
- Gobierno de equivalencias configurables.
- Tratamiento de datos personales y fiscales por tipo de entidad.
- Estrategia de reproyección cuando cambie un mapeador.
- Límites por lote, payload y volumen mensual.
- Permisos de consulta del archivo externo en la interfaz.

## Criterios de aceptación arquitectónicos

- Agregar un proveedor no modifica el dominio de Productos.
- El registro original puede recuperarse exactamente como fue ingerido.
- Una nueva versión de mapeo puede reprocesar registros conservados.
- La proyección repetida es idempotente.
- La identidad externa no depende de un código comercial mutable.
- Los datos históricos no se vuelven entidades editables por accidente.
- Los secretos nunca aparecen en JSONB ni logs.
- Los dominios internos no importan tipos de proveedores.
- La aplicación local y la API pueden evolucionar independientemente del core.
