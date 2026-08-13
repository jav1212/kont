# ADR 0012: Proveedores de tasas de cambio

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

La Web consulta Monitor BCV directamente desde rutas y hooks que mezclan HTTP, caché, formatos externos y decisiones centradas en USD. La arquitectura nativa necesita todas las monedas reconocidas por el producto sin acoplar el negocio a un proveedor ni duplicar el calendario de actualización que dicho proveedor ya administra.

## Decisión

- `monetary-application` define puertos para tasas actuales e históricas, catálogo de monedas, resolución por fecha y caché.
- `monetary-monitor-bcv-adapter` implementa esos puertos como adaptador saliente y es el único paquete que conoce los endpoints, campos y formatos de Monitor BCV.
- Las tasas se transportan como cadenas decimales. El codec preserva los tokens numéricos JSON antes de que sean convertidos a `number`.
- La moneda base se obtiene del código entregado por el proveedor y la cotizada se configura explícitamente; USD no tiene tratamiento especial.
- La fecha solicitada y la fecha efectiva son datos diferentes. Una búsqueda histórica puede resolverse con la publicación anterior disponible.
- Kontave no reproduce horarios de publicación del BCV. Aplica TTL operativos y puede servir temporalmente la última observación válida cuando el proveedor falla.
- La caché persistente o distribuida será un adaptador posterior del puerto `ExchangeRateCache`; la implementación en memoria permite aplicaciones locales y pruebas.
- Los endpoints Web existentes no se migran en esta decisión para respetar el congelamiento de producción.

## Consecuencias

- Cambiar Monitor BCV por otro proveedor no afecta dominio ni casos de uso.
- Cada documento confirmado debe guardar su snapshot y nunca recalcularse con una observación posterior.
- Los clientes nuevos recibirán tasas multimoneda y valores decimales serializados como cadenas.
