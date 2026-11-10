# Variables de entorno en Coolify

Solo nombres. Los valores viven en Coolify; nunca se commitean.

## Build (también disponibles en runtime)

Se incrustan en los bundles durante `next build`, así que cambiar una exige un
rebuild, no basta con reiniciar. Cada una es un `ARG` en el `Dockerfile`: si se
agrega otra `NEXT_PUBLIC_*` al código, hay que declararla también ahí.

| Variable | Requerida | Sin definir |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | La app no funciona. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | La app no funciona. |
| `NEXT_PUBLIC_SITE_URL` | Recomendada | El correo de prueba de admin usa el origen de la petición. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | No | Sin Google Analytics. |
| `NEXT_PUBLIC_DEVICE_MANAGER_URL` | No | Usa `wss://localhost:47831`. |
| `NEXT_PUBLIC_DEVICE_MANAGER_DOWNLOAD_URL` | No | Sin enlace de descarga del Device Manager. |

No definas ninguna con valor vacío: el código usa `??`, y una cadena vacía
anularía el valor por defecto.

## Solo runtime

Mantén estas variables fuera del build (desmarca *Available at Buildtime*): la
imagen no las necesita para compilar y un `build-arg` queda visible en el
historial de la imagen.

| Variable | Uso |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso de servidor a Supabase. |
| `SUPABASE_DB_URL` | Conexión directa a Postgres. |
| `SUPABASE_ADMIN_DB_URL` | Conexión directa de admin; si falta, usa `SUPABASE_DB_URL`. |
| `SUPABASE_DB_POOL_SIZE` | Opcional; por defecto 10. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Correo transaccional. |
| `EMAIL_LOGO_URL` | Opcional; logo de los correos. |
| `CRON_SECRET` | Protege `/api/cron/seniat-reminders`. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting. El acceso por carnet responde 503 en producción sin ellas. |
| `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID` | Recordatorios por WhatsApp. |
| `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG` | Opcionales; plantilla de WhatsApp. |
| `BCV_API_URL` | Opcional; API de tasas BCV. Por defecto `https://bcv.kontave.com`. |
| `KONTAVE_BARCODE_ACCESS_ENABLED`, `KONTAVE_BARCODE_BADGE_ENCRYPTION_KEY` | Acceso por carnet. |
| `KONTAVE_NATIVE_API_ALLOWED_ORIGINS` | Orígenes CORS de la API nativa, separados por comas. |
| `KONTAVE_PUBLIC_ORIGIN` | Origen de los enlaces en invitaciones a organizaciones. Recomendada: `https://kontave.com`. |

`SHARED_SCHEMA_*` existe en entornos antiguos, pero ningún código de la aplicación
la lee; solo aparece en `README.md` y `scripts/audit-shared-schema.mjs`. No hace
falta migrarla.

## Excluir

`VERCEL_*` (incluida `VERCEL_OIDC_TOKEN`), `TURBO_*`, `NX_*`.

`NODE_ENV`, `PORT` y `HOSTNAME` ya los fija la imagen.

## Dependencias de Vercel en el código

- `VERCEL_URL` y otras variables `VERCEL_*`: el código no las usa, así que no hubo
  nada que reemplazar.
- `vercel.json`: fuera de Vercel no tiene efecto. Sus tres funciones se reemplazan así:
  - **Cabeceras de seguridad:** ahora en `next.config.ts`.
  - **Cron:** Scheduled Task de Coolify, abajo.
  - **Redirección www → apex:** Direction = *Redirect to non-www* en Coolify.
- CSP de `middleware.ts`: permite `vercel.live`, `va.vercel-scripts.com` y
  `vercel.com`. Sin efecto fuera de Vercel; se pueden quitar tras la migración.
- La API de tasas BCV vive en `https://bcv.kontave.com`. Si no responde,
  `/api/bcv/*` devuelve 502. Si cambia de dominio, hay que actualizar:
  - `BCV_API_URL` en Coolify.
  - `connect-src` de la CSP en `middleware.ts`.
  - El valor por defecto en `app/api/bcv/_lib.ts` y en
    `packages/monetary/src/adapters/monitor-bcv/index.ts`.

## Scheduled Task

Frecuencia `0 12 * * *` (la misma que en `vercel.json`):

```sh
wget -qO- --header="Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/seniat-reminders
```

Usa `127.0.0.1`, no `localhost`: la imagen Alpine puede resolver `localhost` a
`::1`, y el servidor escucha solo en IPv4. Por eso también conviene poner el host
del healthcheck de Coolify en `127.0.0.1` (path `/api/health`, puerto 3000).

## Dominio de prueba

Usa el dominio `*.sslip.io` con `https://`. La CSP incluye
`upgrade-insecure-requests`, de modo que por `http://` el navegador intentaría
cargar los recursos por HTTPS y la página se vería rota.
