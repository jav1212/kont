# Estándar de arquitectura

Los datos operativos de empresa tienen una sola fuente de verdad: el modelo `public.shared_*` utilizado por Web, Desktop y Mobile. Véase ADR 0030. No se crean copias por cliente ni por esquema de tenant; los contratos modernos se traducen en el adaptador de persistencia y los identificadores compuestos siempre se acotan por organización o tenant.

## Dependencias

```text
presentación ─┐
              ├─> aplicación ─> dominio
infraestructura┘
```

- `apps/*` puede depender de los paquetes agrupados en `packages/<capacidad>/*`.
- Las agrupaciones actuales son `auth`, `devices`, `ui` y `platform`; una nueva agrupación requiere una responsabilidad arquitectónica distinta.
- La ubicación física organiza el repositorio, pero la API pública continúa identificada por nombres estables `@kontave/*`.
- Un paquete nunca depende de una aplicación.
- Una aplicación nunca importa otra aplicación.
- El core recibe puertos mediante construcción explícita.
- Los detalles de plataforma se aíslan en paquetes o adaptadores con nombre de plataforma.

## Criterio de terminación

Un cambio nuevo requiere nombres de dominio claros, TypeScript estricto, errores tipados, pruebas del comportamiento crítico, documentación de su API pública y ejecución satisfactoria de lint, typecheck, pruebas y build correspondientes.

Los comentarios explican decisiones, restricciones o comportamiento no evidente. No describen línea por línea lo que ya expresa el código.
