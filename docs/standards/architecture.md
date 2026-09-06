# Estándar de arquitectura

Los datos operativos de empresa tienen una sola fuente de verdad: el modelo `public.shared_*` utilizado por Web, Desktop y Mobile. Véase ADR 0030. No se crean copias por cliente ni por esquema de tenant; los contratos modernos se traducen en el adaptador de persistencia y los identificadores compuestos siempre se acotan por organización o tenant.

## Dependencias

```text
presentación ─┐
              ├─> aplicación ─> dominio
infraestructura┘
```

- `apps/*` puede depender de los paquetes agrupados por dominio o responsabilidad arquitectónica bajo `packages/`.
- `packages/kernel/` contiene exclusivamente la composición portable, el ciclo de vida y la sesión global de la aplicación. Coordina capacidades, pero no posee sus reglas de negocio.
- `packages/experience/` contiene capacidades portables que modelan la experiencia percibida por el usuario, como feedback, interacción, navegación, preferencias y catálogo de configuración.
- `packages/platform/` contiene capacidades e integraciones técnicas con el entorno, como conectividad, actualizaciones, observabilidad y dispositivos.
- `packages/business/` clasifica bounded contexts que modelan operaciones y políticas empresariales; no constituye un contexto agregado.
- `packages/capabilities/` clasifica capacidades funcionales transversales con propiedad y API pública propias.
- Los contextos de negocio permanecen en `packages/<capacidad>/*`; no se ubican en `kernel`, `experience` o `platform` sólo por ser consumidos por los clientes.
- Una agrupación organiza responsabilidades relacionadas, pero no constituye por sí misma un bounded context ni autoriza dependencias laterales entre sus paquetes.
- La ubicación física organiza el repositorio, pero la API pública continúa identificada por nombres estables `@kontave/*`.
- Un paquete nunca depende de una aplicación.
- Una aplicación nunca importa otra aplicación.
- El core recibe puertos mediante construcción explícita.
- Los detalles de plataforma se aíslan en paquetes o adaptadores con nombre de plataforma.

## Límites verificables

El auditor de workspaces analiza el AST de TypeScript. Revisa imports,
reexports, `import()` y `require()` con especificadores literales, además de
los imports de tipo.

- `src/domain` sólo puede alcanzar código de dominio. `src/application` no puede
  alcanzar `adapters` ni `infrastructure`; ambas capas tampoco pueden importar
  frameworks, plataforma ni Supabase.
- Los paquetes sólo se consumen por un export declarado. Se rechazan imports
  relativos que atraviesan un workspace, imports hacia `app/` o `src/` de la
  Web de producción, y exports portables que reexportan infraestructura de
  forma transitiva.
- El auditor detecta ciclos entre paquetes. `composition` es una raíz permitida;
  los paquetes de renderer y HTTP declarados como externos pueden exponer su
  propia capa exterior.

Estas comprobaciones hacen cumplir las direcciones decididas en
[ADR 0002](../adr/0002-hexagonal-ddd.md) y la granularidad de
[ADR 0035](../adr/0035-bounded-context-package-granularity.md). No sustituyen
la revisión de la semántica del dominio o de las transacciones de persistencia.

## Autoridad de inventario

El dominio portable mantiene las invariantes que puede evaluar sin persistencia:
identidades y cantidades exactas, unidades, periodos, lotes, perfiles,
movimientos, valuación y transiciones de sus agregados. El adaptador Supabase y
las RPC conservan la autoridad sobre acceso por tenant, concurrencia, estado
persistido y atomicidad de la escritura.

En particular, las RPC de las migraciones
[`236_native_inventory_operations.sql`](../../supabase/migrations/236_native_inventory_operations.sql)
y [`245_native_inventory_operation_metadata.sql`](../../supabase/migrations/245_native_inventory_operation_metadata.sql)
validan acceso y empresa, bloquean la operación para postear o revertir,
comprueban `expectedVersion`, conservan los hechos publicados como reversibles
y editan sólo metadatos de borradores. No se deben trasladar esas garantías SQL
al dominio sin una migración que preserve la compatibilidad y la atomicidad.

Los adaptadores de Purchasing y Sales traducen sus eventos a Inventory. Sus
puertos de commit expresan una frontera atómica entre el agregado y un evento
con `operationKey` idempotente, pero actualmente no hay un adaptador persistente
de esos puertos ni un outbox ejecutable. Las pruebas con dobles verifican el
contrato de aplicación; no prueban una publicación durable ni reintentos.

## Criterio de terminación

Un cambio nuevo requiere nombres de dominio claros, TypeScript estricto, errores tipados, pruebas del comportamiento crítico, documentación de su API pública y ejecución satisfactoria de lint, typecheck, pruebas y build correspondientes. Las respuestas de red y persistencia se validan estructuralmente en su frontera antes de cruzar a dominio o aplicación.

Los comentarios explican decisiones, restricciones o comportamiento no evidente. No describen línea por línea lo que ya expresa el código.
