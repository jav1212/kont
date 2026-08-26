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
- Los contextos de negocio permanecen en `packages/<capacidad>/*`; no se ubican en `kernel`, `experience` o `platform` sólo por ser consumidos por los clientes.
- Una agrupación organiza responsabilidades relacionadas, pero no constituye por sí misma un bounded context ni autoriza dependencias laterales entre sus paquetes.
- La ubicación física organiza el repositorio, pero la API pública continúa identificada por nombres estables `@kontave/*`.
- Un paquete nunca depende de una aplicación.
- Una aplicación nunca importa otra aplicación.
- El core recibe puertos mediante construcción explícita.
- Los detalles de plataforma se aíslan en paquetes o adaptadores con nombre de plataforma.

## Criterio de terminación

Un cambio nuevo requiere nombres de dominio claros, TypeScript estricto, errores tipados, pruebas del comportamiento crítico, documentación de su API pública y ejecución satisfactoria de lint, typecheck, pruebas y build correspondientes.

Los comentarios explican decisiones, restricciones o comportamiento no evidente. No describen línea por línea lo que ya expresa el código.
