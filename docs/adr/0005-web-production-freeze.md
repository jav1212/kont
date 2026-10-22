# ADR 0005: Congelamiento arquitectónico de Web

- Estado: reemplazado parcialmente por ADR 0039
- Fecha: 2026-08-11

La migración Web por contexto prevista aquí ya terminó; ADR 0039 registra esa convergencia. El freeze de directorios y los límites de compatibilidad siguen vigentes.

## Decisión

Hasta validar la nueva arquitectura en Desktop y Device Bridge, la Web productiva no será movida ni refactorizada de forma transversal.

Se permiten correcciones críticas, cambios retrocompatibles y endpoints aditivos. No se permiten migraciones destructivas, cambios incompatibles de API ni hacer que Web dependa prematuramente de los paquetes nuevos.

La migración posterior se realizará módulo por módulo, con pruebas de caracterización, feature flags y posibilidad de reversión.

