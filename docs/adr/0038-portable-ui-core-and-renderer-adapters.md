# ADR 0038: Núcleo UI portable y adaptadores por renderer

- Estado: sustituido por ADR 0040
- Fecha: 2026-08-28

## Contexto

El ADR 0037 dejó pendiente decidir si contratos, tokens y adaptadores UI debían
compartir un manifest. La auditoría confirmó dos consumidores y fronteras reales:

| Adaptador | Consumidor | Runtime | React |
| --- | --- | --- | --- |
| DOM | Desktop | Electron 37, Vite 7 y React DOM 19.2 | 19.2 |
| React Native | Mobile | Expo 54, Metro y React Native 0.81 | 19.1 |

Los contratos no dependen de frameworks. Los tokens comparten valores entre
renderers, pero `applyDesignTokens` recibía `HTMLElement` y por tanto era una
operación del adaptador DOM, no parte del núcleo portable.

## Decisión

Se adopta esta distribución:

- `@kontave/ui` expone contratos y tokens mediante `@kontave/ui/contracts` y
  `@kontave/ui/tokens`;
- `@kontave/ui-dom` contiene primitivas y efectos exclusivos de React DOM;
- `@kontave/ui-react-native` contiene primitivas exclusivas de React Native;
- `@kontave/brand-assets` conserva distribución propia por sus recursos no código.

Los adaptadores permanecen separados porque sus peer dependencies, bundlers y
ciclos de entrega son distintos. Los paquetes `@kontave/ui-contracts`,
`@kontave/design-tokens` y `@kontave/ui-native` se retiran en el mismo corte que
migra Desktop y Mobile; no se mantienen wrappers de compatibilidad.

## Consecuencias

- El núcleo portable no importa DOM, React ni React Native.
- El término `native` deja de clasificar contratos o valores portables; el nombre
  completo `react-native` identifica explícitamente al adaptador de renderer.
- Metro no resuelve código React DOM y Electron/Vite no instala React Native por
  medio del sistema de diseño.
- Los consumidores sólo usan exports públicos y cada adaptador puede evolucionar
  según su runtime sin duplicar significado visual.
