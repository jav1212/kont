# Estándar de arquitectura

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
