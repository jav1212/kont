# ADR 0036: Taxonomía de negocio y capacidades transversales

- Estado: aceptado
- Fecha: 2026-08-25

## Contexto

La raíz de `packages/` mezclaba bounded contexts empresariales con capacidades
transversales y clasificaciones de kernel, experiencia y plataforma. Aunque los
nombres públicos eran claros, la navegación física no expresaba la naturaleza
de cada responsabilidad.

## Decisión

Se incorporan dos clasificaciones físicas adicionales:

```text
packages/business/      bounded contexts de operaciones y políticas de negocio
packages/capabilities/  capacidades funcionales transversales
```

`business` contiene inicialmente billing, companies, departments, documents,
employees, fiscal, inventory, modules, payments, payroll, pricing, products,
purchasing, referrals, sales, taxation y unit-economics.

`capabilities` contiene inicialmente auth, access-control y profile. Otros
contextos sólo se moverán cuando su responsabilidad y relaciones demuestren que
pertenecen a esta clasificación.

Estas carpetas no tienen manifest, no son bounded contexts agregados y no
permiten dependencias laterales. La ubicación física no cambia los nombres
públicos `@kontave/*`. Cada contexto continuará consolidándose a un único
workspace según el ADR 0035.

## Consecuencias

- La raíz de paquetes distingue lenguaje empresarial, capacidades transversales,
  experiencia, plataforma, kernel y UI.
- Un movimiento físico no obliga a cambiar consumidores.
- Los globs del workspace admiten paquetes consolidados y paquetes legacy a tres
  niveles durante la migración incremental.
