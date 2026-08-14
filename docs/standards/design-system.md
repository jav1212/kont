# Estándar del sistema de diseño

## Paquetes

- `design-tokens`: valores portables y temas semánticos.
- `brand-assets`: fuentes canónicas de identidad.
- `ui-contracts`: significados compartidos sin dependencia de framework.
- `ui-dom`: primitivas React DOM independientes del cliente para Web, Desktop y otros hosts DOM.
- `ui-native`: futura implementación React Native, creada con Mobile.

## Selección de capa

Una regla o estado de negocio no pertenece a UI. Un layout específico de una pantalla pertenece a su aplicación. Una primitiva visual reutilizable pertenece al renderer correspondiente. Colores, espaciado, radios, sombras y movimiento pertenecen a tokens.

## Criterios de aceptación

- API pública pequeña y tipada.
- HTML semántico y navegación por teclado.
- Estados de foco, error, carga y deshabilitado.
- Temas claro y oscuro con las mismas variables semánticas.
- Sin imports desde aplicaciones.
- Sin estilos de marca duplicados en consumidores.
- TypeScript y build de al menos un consumidor real aprobados.

## Primitivas obligatorias en clientes DOM

- Los controles interactivos usan `Button`; las aplicaciones y los componentes compuestos no declaran `<button>` directamente.
- El contenido textual inline usa `Text`; las aplicaciones y los componentes compuestos no declaran `<span>` directamente.
- Solamente la implementación interna de una primitiva puede emitir esos elementos HTML para preservar su semántica y accesibilidad.
- Una necesidad visual nueva amplía la API tipada de la primitiva propietaria en lugar de crear una implementación paralela en el consumidor.
