# @kontave/ui

Biblioteca de componentes de Kontave para Desktop, Mobile y futuros clientes
Web. Cada consumidor importa el mismo catálogo:

```tsx
import {
  Button,
  Checkbox,
  DatePeriodPicker,
  DatePicker,
  OptionPicker,
  TextField,
  UiProvider,
} from "@kontave/ui";
```

El paquete selecciona el renderer mediante exports condicionales: React DOM
por defecto y React Native para `kontave-react-native` o `react-native`.
`@kontave/ui/contracts` y `@kontave/ui/tokens` son los únicos subpaths
portables públicos. No importe `core`, `dom` ni `react-native` directamente.

## Contrato de los componentes

Las primitivas son independientes de quien las consume. No realizan solicitudes,
no leen sesión o contexto de empresa, no deciden destinos ni rutas y no
contienen reglas de negocio. El cliente provee datos, estado y callbacks. Por
ejemplo, un `SidebarLink` puede abrir el `href` o ejecutar el `onPress` que le
provee el consumidor, igual que un enlace DOM.

```tsx
<UiProvider theme="light" locale="es-VE">
  <TextField label="Nombre" value={name} onValueChange={setName} />
  <Checkbox label="Activo" checked={active} onCheckedChange={setActive} />
  <OptionPicker label="Moneda" value={currency} options={currencies}
    onValueChange={setCurrency} />
  <Button onPress={save}>Guardar</Button>
</UiProvider>
```

`Button` usa `children` y `onPress`. `TextField`, `OptionPicker`, `DatePicker`
y `DatePeriodPicker` usan `onValueChange`; `Checkbox` usa
`onCheckedChange`. DOM conserva propiedades nativas adicionales cuando son
necesarias para una integración, pero los contratos anteriores son la API
portátil preferida.

`UiProvider` aplica `theme` (`light` o `dark`) y `locale`; las preferencias,
persistencia y detección de plataforma son responsabilidad de la aplicación.

## Fechas y períodos

`DatePicker` es controlado y recibe/emite una fecha calendario `YYYY-MM-DD`.
`DatePeriodPicker` recibe/emite un mes `YYYY-MM`; no selecciona rangos. Ambos
aceptan límites inclusivos `min` y `max`, no convierten el valor a UTC y sólo
comunican una selección explícita. `DatePicker` usa el control nativo en iOS y
Android; Expo Web resuelve el control web de la biblioteca. `DatePeriodPicker`
siempre muestra una cuadrícula de meses.

## Dependencias y verificación

React es un peer dependency requerido. React DOM, React Native, React Aria,
`@internationalized/date` y el control nativo de fecha son peers opcionales;
cada consumidor instala los que exige su renderer. Las dependencias de
desarrollo del paquete no se usan para decidir el renderer en runtime.

```bash
corepack pnpm --filter @kontave/ui check
corepack pnpm --filter @kontave/ui test
corepack pnpm --filter @kontave/ui-smoke check
corepack pnpm --filter @kontave/ui-smoke build
corepack pnpm --filter @kontave/ui-smoke test:browser
```

El fixture `@kontave/ui-smoke` valida el consumidor DOM de Next.js. Los
catálogos de desarrollo están disponibles en Desktop con `#ui-catalog` y en
Mobile con `/ui-catalog`. Consulte el
[estándar del sistema de diseño](../../docs/standards/design-system.md) y el
[ADR 0040](../../docs/adr/0040-unified-ui-package-with-renderer-conditions.md)
para los límites arquitectónicos.
