# Kontave Mobile

Cliente React Native construido con Expo. Comparte contratos, lógica portable y
tokens visuales con el monorepo, pero conserva presentación nativa propia.

## Desarrollo local

Desde la raíz del repositorio:

```bash
corepack pnpm install
corepack pnpm mobile:dev
```

Mobile reutiliza automáticamente desde `.env`/`.env.local` en la raíz:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Opcionalmente, copia `apps/mobile/.env.example` como `apps/mobile/.env.local`
para declarar overrides específicos de Expo:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_KONTAVE_API_URL` (opcional; usa `https://kontave.com` por defecto)

La sesión se persiste mediante `expo-secure-store`. La selección del espacio de
trabajo usa AsyncStorage porque no contiene credenciales.

En la terminal de Expo, presiona `a` para Android, `i` para iOS o escanea el QR
con Expo Go desde un dispositivo conectado a la misma red.

También se puede abrir un simulador directamente:

```bash
corepack pnpm mobile:android
corepack pnpm mobile:ios
corepack pnpm mobile:web
```

## Límites arquitectónicos

- `src/app` contiene rutas y composición de presentación.
- La aplicación consume paquetes mediante sus APIs públicas.
- Dominio y aplicación permanecen en `packages/`; no se duplican dentro del cliente.
- Este cliente no importa Web, Desktop, Next.js ni adaptadores de otra plataforma.
- Las llamadas HTTP usan `@kontave/native-api-client` y `/api/native/v1/*`.
- Los componentes reutilizables de React Native viven en `@kontave/ui-native`.
