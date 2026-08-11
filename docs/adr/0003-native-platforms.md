# ADR 0003: Clientes nativos

- Estado: aceptado
- Fecha: 2026-08-11

## Decisión

- Web continúa en Next.js/PWA.
- Desktop será una aplicación Electron diseñada para escritorio, no una simple ventana remota de la Web.
- Mobile será React Native/Expo con presentación nativa.
- Web y Desktop podrán compartir componentes React DOM cuando su experiencia coincida.
- Mobile comparte dominio, aplicación, API, contratos y tokens visuales, pero mantiene componentes React Native propios.

