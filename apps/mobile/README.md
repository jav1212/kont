# Kontave Mobile

Cliente nativo de Kontave construido con Expo, React Native y Expo Router. Consume las capacidades portables del monorepo y mantiene HTTP, almacenamiento seguro, UI nativa y actualizaciones OTA dentro de adaptadores Mobile.

La aplicación Web de producción y Desktop no dependen de Mobile.

## Desarrollo

Desde la raíz del monorepo:

```bash
corepack pnpm install
KONTAVE_API_URL=http://localhost:3000 corepack pnpm --filter @kontave/mobile dev
```

Para Web durante desarrollo:

```bash
KONTAVE_API_URL=http://localhost:3000 corepack pnpm --filter @kontave/mobile web
```

Si Metro conserva estilos o módulos anteriores, reinícialo limpiando su caché:

```bash
KONTAVE_API_URL=http://localhost:3000 corepack pnpm --filter @kontave/mobile dev:clear
```

Verificación:

```bash
corepack pnpm --filter @kontave/mobile typecheck
corepack pnpm --filter @kontave/mobile exec expo export --platform web
```

## Contexto de trabajo

Mobile utiliza `@kontave/workspace-context-application` para restaurar y seleccionar atómicamente workspace, empresa y módulo. La selección se persiste localmente y se valida nuevamente contra las opciones disponibles.

El selector central muestra:

- avatar del workspace;
- logo, nombre y RIF de la empresa;
- icono propio del módulo;
- búsqueda por nombre o RIF cuando existen más de cinco empresas.

Durante un cambio de contexto, Mobile adquiere un bloqueo `exclusive_operation` mediante `@kontave/client-interaction-application`. La selección queda cubierta por una pantalla de carga completa, opaca y no interactiva hasta que empresas, módulos, permisos y persistencia local estén listos. Un fallo conserva el contexto anterior y mantiene abierto el selector.

## Shell Mobile

La experiencia autenticada utiliza una composición específica para teléfono:

- top bar con marca `K.`, selector central `Kontave.` y avatar de cuenta;
- selector contextual de workspace, empresa y módulo desde la marca central;
- contenido inicial determinado por el módulo activo;
- navegación inferior flotante con `Inicio` y `Más`;
- menú de cuenta presentado como bottom sheet al seleccionar el avatar.

El menú de cuenta reúne perfil, facturación, estado de portales, ayuda, configuración y cierre de sesión. Su backdrop usa una transición uniforme de enfoque; no se desplaza junto al sheet.

## Navegación

`@kontave/navigation-domain` es propietario de los identificadores, etiquetas, jerarquías, parámetros dinámicos y breadcrumbs. Mobile conserva `NavigationTarget` como estado semántico y `mobile-navigation.ts` declara únicamente la matriz de destinos e iconos presentables en teléfono.

Cambiar el módulo activo restablece su destino inicial. Los destinos no soportados se rechazan antes de modificar el estado.

## Experiencia del cliente

Mobile consume:

- `@kontave/client-connectivity-contracts`
- `@kontave/client-connectivity-application`
- `@kontave/client-interaction-application`
- `@kontave/client-feedback-application`
- `@kontave/client-updates-contracts`
- `@kontave/client-updates-application`

Estas capacidades proporcionan:

- prueba periódica de disponibilidad del API y reintento manual;
- bloqueo global cuando el servicio no está disponible;
- bloqueo exclusivo durante cambios de workspace, empresa o módulo;
- feedback deduplicado y autocerrable mediante tarjetas flotantes blancas;
- estados visuales propios para información, éxito, advertencia y error;
- códigos de error copiables y cierre explícito de notificaciones;
- coordinación tipada de comprobación, descarga y aplicación de actualizaciones;
- actualización OTA mediante `expo-updates` y recarga de la aplicación.

En Web, la prueba de conectividad usa una solicitud `HEAD` en modo `no-cors`; una respuesta opaca confirma alcance de red sin confundir restricciones CORS con indisponibilidad del servicio.

`@kontave/client-updates-electron` es un adaptador exclusivo de Desktop y nunca debe importarse desde Mobile. `ExpoClientUpdateProvider` implementa en Mobile el mismo puerto `ClientUpdateProvider`.

Expo Updates se considera deshabilitado en Expo Go y builds de desarrollo que no tengan configuración OTA. En esos entornos el coordinador informa que la aplicación está al día y no intenta descargar.

## Identidad y sesión

- `@kontave/auth-domain`
- `@kontave/auth-application`
- `@kontave/auth-supabase`

La sesión se almacena mediante adaptadores seguros por plataforma. Las solicitudes autenticadas comparten la coordinación de refresh y reaccionan globalmente ante la expiración de sesión.

## Endpoints consumidos

| Endpoint | Uso |
|---|---|
| `GET /api/native/v1/me` | Perfil personal |
| `GET /api/native/v1/organization-access` | Workspaces disponibles |
| `GET /api/native/v1/organizations/{organizationId}/operational-companies` | Empresas operativas |
| `GET /api/native/v1/organizations/{organizationId}/companies` | Presentación y logos empresariales |
| `GET /api/native/v1/organizations/{organizationId}/modules/available?platform=mobile` | Módulos compatibles |

## Estructura

```text
src/
├── api/                Cliente HTTP Mobile
├── app/                Composición de Expo Router
├── auth/               Sesión y almacenamiento seguro
├── client-experience/  Conectividad, interacción, feedback y updates
├── navigation/         Presentación Mobile del dominio de navegación
├── presentation/       Pantallas y shell nativo
└── workspace/          Adaptadores y provider del contexto de trabajo
```

Reglas de dependencia:

- Mobile puede importar packages; los packages nunca importan Mobile.
- Los componentes no acceden directamente a Supabase.
- Los detalles Expo, React Native, HTTP y almacenamiento permanecen en adaptadores Mobile.
- Los identificadores de navegación y reglas de contexto no se duplican en la capa visual.

## Variables de entorno

Requeridas:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Opcional:

```text
KONTAVE_API_URL
```

`KONTAVE_API_URL` usa `https://kontave.com` cuando no se configura.
