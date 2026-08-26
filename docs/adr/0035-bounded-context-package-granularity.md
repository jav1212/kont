# ADR 0035: Granularidad de paquetes por bounded context

- Estado: aceptado
- Fecha: 2026-08-25

## Contexto

La separación inicial de cada capa hexagonal en un workspace independiente hizo
explícita la dirección de dependencias, pero también multiplicó manifests,
configuraciones TypeScript, instalaciones y coordinación de versiones. Esa
granularidad confundía una capa lógica con una unidad de distribución.

## Decisión

La unidad predeterminada de empaquetado es el bounded context o una capacidad
arquitectónica con consumidores reales. `domain`, `application`, `adapters` y
`testing` son módulos internos del paquete y no workspaces independientes.

```text
packages/<capacidad>/
  package.json
  src/
    domain/
    application/
    adapters/
    index.ts
  test/
```

Cuando un consumidor necesita una superficie específica, el paquete la expone
mediante subpath exports, por ejemplo `@kontave/auth/domain` y
`@kontave/auth/supabase`. Los módulos internos utilizan imports relativos y
extensionless para que la dirección de dependencias sea visible sin crear ciclos
entre workspaces.

Un paquete adicional requiere al menos una frontera demostrable de runtime,
distribución, dependencias, propiedad, seguridad o ciclo de entrega. Las
clasificaciones físicas como `kernel`, `experience`, `platform` o una futura
agrupación de negocio sirven para navegación; no son paquetes agregadores ni
autorizan dependencias laterales.

La migración será incremental por contexto. No se mantienen paquetes de
compatibilidad permanentes: los consumidores migran al nombre consolidado en la
misma entrega que cada contexto.

## Consecuencias

- Disminuyen los manifests y referencias TypeScript sin perder las capas
  hexagonales.
- La API pública del contexto queda definida por `exports`.
- Las restricciones entre capas se verifican con TypeScript, ESLint y revisiones
  de arquitectura en lugar de usar un paquete por carpeta.
- Adaptadores con dependencias incompatibles entre runtimes pueden conservar un
  paquete propio cuando exista evidencia concreta para ello.
