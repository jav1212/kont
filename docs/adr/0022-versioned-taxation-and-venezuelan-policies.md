# ADR 0022: Tributacion versionada separada de productos y documentos fiscales

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

En Venezuela una linea de factura puede estar gravada, exenta, exonerada o no sujeta. Esa clasificacion no es una propiedad universal e inmutable de `Product`: corresponde a un impuesto, jurisdiccion, empresa y periodo de vigencia. Ademas, impuestos como el IGTF descrito por el manual fiscal de referencia nacen de las condiciones del pago y no del producto.

`fiscal` ya conserva documentos y resultados historicos. No debe decidir que regla tributaria esta vigente ni recalcular documentos emitidos. `products` tampoco debe importar conocimiento fiscal.

## Decision

Crear las capacidades siguientes:

- `@kontave/taxation-domain`: codigos, tratamientos, perfiles tributarios de producto, asignaciones temporales, reglas versionadas y decisiones tributarias neutrales.
- `@kontave/taxation-venezuela`: politicas puras para resolver IVA por linea e IGTF por asignacion de pago usando reglas proporcionadas explicitamente.
- `@kontave/taxation-fiscal`: integracion que traduce una decision tributaria a un snapshot de `FiscalDocument` sin acoplar los dominios entre si.
- `@kontave/taxation-testing`: fixtures estables para consumidores futuros.

Las tasas no se incrustan como constantes legales. Cada regla declara codigo, tratamiento, tasa, modo de calculo, vigencia, fundamento y version. La aplicacion debe proveer el conjunto de reglas vigente y auditado.

## Modelo

`ProductTaxProfile` referencia `ProductId` y contiene asignaciones por codigo tributario. Para un mismo impuesto no admite vigencias superpuestas. Una clasificacion ausente bloquea la determinacion en lugar de asumir que el producto esta exento o gravado.

Los tratamientos iniciales son:

- `taxed`: sujeto y gravado;
- `exempt`: exento por la norma aplicable;
- `exonerated`: beneficio o dispensa con vigencia propia;
- `not_subject`: fuera del hecho imponible.

La politica de IVA resuelve una linea usando su importe neto, fecha, perfil y regla. Soporta impuesto incluido y excluido del precio con dinero y decimales exactos.

La politica de IGTF evalua cada asignacion de pago de forma independiente. Una regla puede aplicar a monedas distintas de la moneda de curso legal o a una lista explicita. La base reconocida permanece en la moneda del documento y la moneda entregada conserva su snapshot cambiario en `fiscal`.

## Invariantes

- Perfil, producto y asignaciones pertenecen a la misma empresa y jurisdiccion declaradas por el perfil.
- Un impuesto tiene como maximo una clasificacion aplicable por fecha.
- Las fechas efectivas son intervalos cerrados y no se superponen.
- Todo resultado identifica la version y fundamento de la regla utilizada.
- Exento, exonerado y no sujeto producen tasa e importe cero, pero preservan su base informativa.
- Una regla gravada requiere una tasa positiva.
- Una decision usa una sola moneda para base e importe.
- IGTF se asocia a la clave del pago que lo origino y se calcula solamente sobre su importe reconocido elegible.
- Pagos en moneda de curso legal no se consideran automaticamente pagos en divisa.
- Una factura emitida o recibida conserva snapshots y nunca se recalcula al cambiar perfiles o reglas.

## Fronteras

`taxation` no es propietario de productos, facturas, pagos financieros, cobros ni documentos de inventario. Recibe snapshots e identificadores y devuelve decisiones. No contiene comandos HKA, persistencia, UI ni porcentajes legales no versionados.

La verificacion normativa y carga de reglas vigentes son responsabilidades explicitas de aplicacion y administracion. Este ADR define el modelo y no certifica que una tasa de ejemplo este legalmente vigente.

## Consecuencias

- Compras y ventas podran compartir las mismas politicas sin duplicar IVA o IGTF.
- Un producto puede cambiar de tratamiento sin reescribir facturas historicas.
- Las bases de impuestos diferentes permanecen separadas y no se suman como si fueran una unica base economica.
- `Product` continua libre de campos fiscales y `FiscalDocument` continua libre de reglas venezolanas.
