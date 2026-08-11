# Estándar TypeScript para código nuevo

- `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` son obligatorios.
- `any`, aserciones no verificadas y `!` requieren una justificación local excepcional.
- Los estados y errores conocidos se modelan con uniones discriminadas.
- Las funciones públicas declaran tipos de entrada y salida.
- Se prefieren objetos inmutables y dependencias explícitas.
- No se crean carpetas generales `utils` o `helpers`; cada pieza pertenece a una capacidad concreta.

