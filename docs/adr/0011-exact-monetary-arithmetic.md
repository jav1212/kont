# ADR 0011: Aritmética monetaria exacta

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

Compras y ventas necesitan compartir conversiones cambiarias, redondeo y distribución de residuos sin depender de `number` ni duplicar conocimiento entre plataformas. Las tasas oficiales pueden tener una escala mayor que la unidad menor de la moneda y los documentos históricos deben conservar la tasa aplicada al momento de la operación.

## Decisión

Se crea la capacidad `monetary` con los paquetes `@kontave/monetary-domain` y `@kontave/monetary-testing`.

- `Money` representa importes cuantizados mediante unidades menores y `bigint`.
- Los cálculos intermedios usan aritmética decimal arbitraria. `decimal.js` queda encapsulado y no forma parte de la API pública.
- Los decimales entran y salen de la capacidad como cadenas validadas. No se aceptan valores `number` en constructores exactos.
- Cada moneda declara explícitamente su cantidad de unidades menores; el dominio no presume que todas usan dos decimales.
- Las tasas identifican moneda base y moneda cotizada. La conversión rechaza tasas en una dirección incompatible.
- La escala publicada de la tasa se conserva separadamente de su valor decimal canónico.
- El redondeo es una política explícita aplicada solamente en fronteras declaradas.
- La distribución de importes garantiza que la suma de las partes sea idéntica al total. Se soporta acarreo a la última parte para compatibilidad y mayor residuo para casos nuevos.
- Los importes pueden ser negativos. Cada dominio consumidor impone sus restricciones de signo.
- La procedencia y vigencia de una tasa se modelan como un snapshot inmutable, pero la obtención desde BCV u otra fuente pertenece a adaptadores externos.

## Consecuencias

- Facturación, impuestos, compras, ventas, cobranzas y contabilidad pueden depender de primitivas monetarias comunes sin introducir conceptos propios en `monetary`.
- Los contratos HTTP y la persistencia deben serializar `bigint` y decimales como cadenas.
- La aplicación Web de producción no adopta este paquete hasta una tarea explícita de migración con pruebas de paridad.
- Las fórmulas SQL que deban permanecer autoritativas requieren escenarios de paridad contra el dominio TypeScript.
