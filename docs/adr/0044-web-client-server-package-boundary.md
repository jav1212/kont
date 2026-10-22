# ADR 0044: Frontera cliente/servidor de la Web sobre paquetes

- Estado: aceptado
- Fecha: 2026-10-22

## Contexto

La Web de producción consume paquetes `@kontave/*` junto con módulos heredados
del árbol `src/`. La API pública de un paquete puede incluir tanto contratos
portables como adaptadores de plataforma. El código cliente necesita límites
verificables para evitar que los adaptadores o credenciales de servidor entren
en su grafo de módulos.

La migración de Web por contexto descrita en [ADR 0039](0039-phase-3-web-package-convergence.md)
ya terminó. El freeze de directorios y los límites de compatibilidad de
[ADR 0005](0005-web-production-freeze.md) siguen vigentes.

## Decisión

### Composition roots de servidor

Los composition roots de la Web que instancian adaptadores o leen credenciales
de servidor importan `server-only`. Esto marca las entradas de
`src/client-api/v1/**` que alcanzan adaptadores,
`src/modules/**/backend/infra/**/*-factory.ts` y
`src/modules/security/backend/web-security.ts`.

El marcador no se agrega dentro de `packages/**`: Desktop y Mobile consumen
algunos exports de adaptadores fuera de React Server, donde `server-only`
rechazaría esos imports. Cada aplicación protege su propia frontera de runtime.

### Reglas ESLint de la Web

- En `app/`, la restricción de adaptadores se aplica solo a archivos que declaran
  `"use client"`, porque ese árbol mezcla Server Components y Client Components.
- En `src/**/frontend/**`, se prohíben imports de adaptadores y composition roots
  de servidor. Se permiten imports solo de tipos y imports de `backend/domain`
  del código heredado, que no llevan infraestructura al bundle.
- En la superficie cliente y en el código de producción de `app/` y `src/`, se
  prohíbe importar `@kontave/*/testing`. Los tests quedan excluidos de esa regla.
- No se cambia el control existente que exige imports TypeScript relativos sin
  extensión `.js`.

La lista pública de paquetes no implica que todos sus exports sean aptos para el
navegador. Los adaptadores `/supabase`, `/postgres` y `/adapters/*` se importan
desde `app/api/**`, `src/client-api/**` o `src/**/backend/**`.

### Contratos de transporte del kernel

`@kontave/client-contracts` puede depender de otro workspace `@kontave/*` solo
mediante una subruta `/contracts` y una declaración `import type` o
`export type`. Esto mantiene una sola fuente de verdad para contratos
validados, incluido Treasury, sin acoplar el paquete de contratos a
implementaciones de negocio.

Esta regla se limita a `packages/kernel/contracts/**`. Los paquetes de
`kernel/workspace` y `kernel/remote` coordinan capacidades y dominios de
negocio según [ADR 0034](0034-kernel-experience-platform-taxonomy.md); sus
dependencias existentes en `/domain` y `/application` siguen permitidas.

### Dependencias de manifiesto

Las dependencias de `package.json` pertenecen al paquete, no a una capa
individual. La portabilidad de `domain` y `application` se verifica sobre los
imports reales mediante `tooling/architecture`; no se infiere de que un SDK
aparezca en el manifiesto del paquete.

## Consecuencias

- Un composition root marcado que llega, directa o transitivamente, al grafo de
  un Client Component hace fallar `next build`.
- ESLint detecta los imports directos de adaptadores de paquetes (que no llevan
  el marcador) y de fixtures en producción, y conserva los usos de tipos y
  dominio puro del código heredado. Un import transitivo de un adaptador que no
  pase por un composition root marcado no queda cubierto por ninguno de los dos
  controles.
- Los paquetes nativos continúan usando los adaptadores públicos sin depender
  del marcador de Next.js.
- `tooling/architecture` impide que `client-contracts` amplíe su acoplamiento
  más allá de contratos tipados.
