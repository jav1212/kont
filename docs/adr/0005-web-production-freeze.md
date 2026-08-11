# ADR 0005: Congelamiento arquitectónico de Web

- Estado: aceptado
- Fecha: 2026-08-11

## Decisión

Hasta validar la nueva arquitectura en Desktop y Device Bridge, la Web productiva no será movida ni refactorizada de forma transversal.

Se permiten correcciones críticas, cambios retrocompatibles y endpoints aditivos. No se permiten migraciones destructivas, cambios incompatibles de API ni hacer que Web dependa prematuramente de los paquetes nuevos.

La migración posterior se realizará módulo por módulo, con pruebas de caracterización, feature flags y posibilidad de reversión.

