# Estándar TypeScript para código nuevo

- `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` son obligatorios.
- `any`, aserciones no verificadas y `!` requieren una justificación local excepcional.
- Los estados y errores conocidos se modelan con uniones discriminadas.
- Las funciones públicas declaran tipos de entrada y salida.
- Se prefieren objetos inmutables y dependencias explícitas.
- No se crean carpetas generales `utils` o `helpers`; cada pieza pertenece a una capacidad concreta.
- Un tipo genérico no valida datos externos. Los adaptadores decodifican de forma
  estructural respuestas HTTP, RPC y almacenamiento antes de devolver DTOs.
  No se coercionan campos: las propiedades adicionales compatibles se conservan
  y un payload incompleto, nulo o de tipo distinto produce un error tipado de
  frontera.
- Las reglas de ESLint específicas de Next.js se aplican a la Web raíz. En
  `apps/`, `packages/` y `tooling/` permanecen las reglas comunes de
  TypeScript/React, sin imponer convenciones de rutas o bundler de Next.js.
