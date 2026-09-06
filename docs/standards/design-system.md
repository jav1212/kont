# Estándar del sistema de diseño

## Paquete y API pública

`@kontave/ui` es la única entrada de componentes para Desktop, Mobile y un
futuro cliente Web. Sus exports condicionales seleccionan React DOM por defecto
y React Native para las condiciones `kontave-react-native` o `react-native`.
Las aplicaciones no importan directorios internos ni eligen un adaptador.

`@kontave/ui/contracts` expone contratos portables y `@kontave/ui/tokens`
expone tokens y tipos de tema. `@kontave/brand-assets` conserva las fuentes
canónicas de identidad. La decisión y los límites de distribución se describen
en el [ADR 0040](../adr/0040-unified-ui-package-with-renderer-conditions.md).

## Selección de capa

Una regla o estado de negocio no pertenece a UI. Un layout específico de una
pantalla pertenece a su aplicación. Una primitiva visual reutilizable pertenece
al catálogo `@kontave/ui`. Colores, espaciado, radios, sombras y movimiento
pertenecen a tokens. Los renderer adapters son internos y sólo conocen su
plataforma de renderizado.

Los consumidores usan contratos controlados: `Button` recibe contenido por
`children` y acciones por `onPress`; `TextField` comunica texto con
`onValueChange`; `Checkbox` comunica selección con `onCheckedChange`; y
`OptionPicker`, `DatePicker` y `DatePeriodPicker` comunican valor con
`onValueChange`. `UiProvider` recibe `theme` y `locale`; elegirlos, persistirlos
o obtenerlos de preferencias es responsabilidad del consumidor.

Las fechas son valores calendario: `DatePicker` usa `YYYY-MM-DD` y
`DatePeriodPicker` usa `YYYY-MM`. Ambos son controlados, no aplican reglas de
negocio y respetan los límites inclusivos opcionales `min` y `max`.

## Criterios de aceptación

- API pública pequeña y tipada.
- HTML semántico y navegación por teclado.
- Estados de foco, error, carga y deshabilitado.
- Temas claro y oscuro con las mismas variables semánticas.
- Sin imports desde aplicaciones, rutas, APIs, sesión o estado de negocio.
- Sin estilos de marca duplicados en consumidores.
- TypeScript y build de al menos un consumidor real ejecutados como parte del
  cambio que afecte la biblioteca.

## Uso en clientes

Desktop y Mobile importan el catálogo de la raíz:

```tsx
import { Button, TextField, UiProvider } from "@kontave/ui";
```

Mobile configura Metro para la condición `kontave-react-native`. Expo Web usa
esa misma rama y el control de fecha web de la biblioteca. React es un peer
requerido; las dependencias específicas de DOM o React Native son peers
opcionales que instala el consumidor de esa plataforma. Una dependencia de
desarrollo de `@kontave/ui` no habilita una plataforma en runtime. La aplicación
Web de producción conserva HeroUI hasta que un trabajo de migración explícito
indique lo contrario.

## Primitivas obligatorias en clientes DOM

- Los controles interactivos usan `Button`; las aplicaciones y los componentes compuestos no declaran `<button>` directamente.
- El contenido textual inline usa `Text`; las aplicaciones y los componentes compuestos no declaran `<span>` directamente.
- Solamente la implementación interna de una primitiva puede emitir esos elementos HTML para preservar su semántica y accesibilidad.
- Una necesidad visual nueva amplía la API tipada de la primitiva propietaria en lugar de crear una implementación paralela en el consumidor.
