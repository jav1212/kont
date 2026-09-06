# ADR 0040: Paquete UI único con condiciones de renderer

- Estado: aceptado
- Fecha: 2026-09-06
- Sustituye: ADR 0038

## Contexto

El ADR 0038 separó los adaptadores DOM y React Native en paquetes públicos.
Esa separación protegía sus dependencias, pero obligaba a cada cliente a elegir
un import distinto. La biblioteca debe expresar un catálogo y contrato de UI de
Kontave, sin conocer la aplicación que la consume.

Desktop, Mobile y un futuro cliente Web necesitan importar el mismo catálogo.
Las diferencias de renderizado, accesibilidad y controles de fecha siguen
siendo reales y no deben filtrarse a los consumidores ni introducir dependencias
DOM en Mobile.

## Decisión

`@kontave/ui` es la única entrada pública de componentes. Su export raíz se
resuelve por condición de paquete: `kontave-react-native` y `react-native`
seleccionan la implementación React Native; `default` selecciona React DOM.
`@kontave/ui/contracts` y `@kontave/ui/tokens` permanecen como subpaths
portables para contratos y valores sin renderer.

Los directorios internos `core`, `dom` y `react-native` son detalles de
implementación del mismo workspace; no son paquetes ni APIs para aplicaciones.
Los consumidores importan componentes desde la raíz y configuran su bundler
para elegir la condición correspondiente. Metro y Expo Web usan la condición
nativa; Expo Web usa el control de fecha web incluido para no cargar un módulo
nativo incompatible.

Las primitivas no importan aplicaciones ni contienen datos, sesión, empresas,
reglas de negocio o persistencia; tampoco deciden destinos o rutas. Un enlace
puede ejecutar el `href` o `onPress` suministrado por el consumidor. Las
composiciones que conocen esos conceptos pertenecen a la presentación de cada
cliente. Desktop, por ejemplo, es propietario de su integración de feedback y
bloqueo global.

## Consecuencias

- `Button`, campos, selectores, layout, navegación visual, feedback, marca y
  skeletons forman un catálogo con nombres y contratos coherentes entre
  renderers.
- React DOM puede usar dependencias de accesibilidad DOM y React Native puede
  usar primitivas nativas, modales y controles de fecha de cada plataforma.
  React es un peer requerido. Las demás dependencias específicas de renderer
  son peers opcionales y las aporta el consumidor de su plataforma; las
  dependencias de desarrollo no intervienen en la resolución de runtime.
- `DatePicker` acepta y devuelve fechas calendario `YYYY-MM-DD`; no convierte
  zonas horarias. En iOS y Android usa el control nativo; Expo Web usa el
  control web de la biblioteca. `DatePeriodPicker` acepta y devuelve meses
  `YYYY-MM`, muestra una cuadrícula de meses en todos los renderers y no es un
  selector de rango. Ambos son controlados y respetan límites inclusivos `min`
  y `max`.
- La Web de producción continúa usando HeroUI. Su migración no forma parte de
  esta decisión ni se habilita por el nuevo export DOM.

## Migración y compatibilidad

Los imports `@kontave/ui-dom` y `@kontave/ui-react-native` dejan de ser APIs
públicas. Un consumidor se migra reemplazando esos imports por `@kontave/ui` y
configurando la condición de renderer antes de retirar el paquete anterior.
No hay wrapper de compatibilidad. La reversión consiste en restaurar el
paquete anterior y sus imports como un corte completo.
