# ADR 0007: API nativa v1 y autenticación portable

- Estado: aceptado
- Fecha: 2026-08-11

## Contexto

Kontave Web opera en producción y sus rutas actuales usan autenticación basada en cookies. Desktop y Mobile necesitan un contrato estable, autenticación por token y una evolución independiente sin introducir regresiones en Web.

## Decisión

Las aplicaciones nativas consumirán endpoints nuevos bajo `/api/native/v1/*`. Ninguna implementación de esta API importará middleware, fábricas ni casos de uso heredados de Web salvo que hayan sido extraídos previamente a un puerto estable y verificado.

La autenticación se divide en:

- `auth-domain`: identidad, sesión y fallos de dominio sin dependencias de framework.
- `auth-application`: casos de uso y puertos de autenticación.
- `auth-supabase`: adaptadores concretos de Supabase.
- `native-api-contracts`: DTOs y envoltorios HTTP versionados.

La API acepta exclusivamente `Authorization: Bearer <token>` y valida el token con el proveedor. Las respuestas usan:

```json
{ "data": {}, "meta": { "requestId": "uuid" } }
```

o:

```json
{ "error": { "code": "STABLE_CODE", "message": "Mensaje seguro", "requestId": "uuid" } }
```

Desktop conserva los tokens en el proceso principal de Electron usando `safeStorage`. El renderer recibe solo el estado autenticado y la identidad sanitizada mediante IPC validado.

## Variables de Desktop

- `KONTAVE_SUPABASE_URL`
- `KONTAVE_SUPABASE_ANON_KEY`

Son parámetros de conexión públicos, pero permanecen fuera del renderer para preservar el límite arquitectónico. Las credenciales del usuario y los tokens nunca se registran ni se exponen por IPC.

## Consecuencias

- Web continúa usando sus rutas actuales sin cambios.
- Desktop y Mobile comparten dominio, casos de uso y contratos, no detalles de framework.
- Cambiar Supabase requiere sustituir adaptadores, no reescribir UI ni dominio.
- Los siguientes recursos nativos (empresas, inventario, ventas) deben añadirse detrás de nuevos puertos y rutas v1, con autorización de tenant explícita.
