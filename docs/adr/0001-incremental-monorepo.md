# ADR 0001: Monorepo incremental

- Estado: aceptado
- Fecha: 2026-08-11

## Contexto

Kontave Web está en producción y tiene clientes activos. Kontave Desktop, Mobile y Device Bridge necesitarán compartir contratos y lógica TypeScript sin convertir la reorganización en una migración riesgosa de la aplicación Web.

## Decisión

Se adopta un workspace pnpm incremental. La aplicación Next.js permanece temporalmente en la raíz. Las aplicaciones nuevas vivirán en `apps/` y el código portable en `packages/`. Web no consumirá los paquetes nuevos hasta que Desktop y Device Bridge hayan validado sus contratos.

## Consecuencias

- Vercel y las rutas actuales continúan sin cambios durante esta etapa.
- Ninguna aplicación puede importar código de otra aplicación.
- Los paquetes deben declarar una API pública y no pueden depender de frameworks salvo que su nombre indique la plataforma.
- La futura mudanza de Web a `apps/web` será una operación independiente y reversible.

