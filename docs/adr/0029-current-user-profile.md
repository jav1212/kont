# ADR 0029: Perfil del usuario autenticado

- Estado: aceptado
- Fecha: 2026-08-15

## Contexto

Las aplicaciones nativas necesitan nombre visible y avatar del usuario autenticado. La identidad y el correo son autoritativos en autenticación, mientras que la Web productiva conserva los datos de presentación en `public.profiles`. Incluir estos datos en `auth` mezclaría credenciales y sesión con información editable de cuenta; modelar `me` como dominio convertiría una conveniencia HTTP en lenguaje de negocio.

## Decisión

- La API expone `GET /api/native/v1/me` como una proyección pequeña del actor autenticado.
- `auth-domain` continúa siendo dueño de `userId` y `email`.
- La capacidad `profile` compone la identidad con `displayName` y `avatarUrl` mediante un puerto de lectura de aplicación.
- No se crea `profile-domain` mientras el perfil carezca de invariantes y comportamiento propios.
- `profile-supabase` adapta temporalmente `public.profiles` y consulta con el JWT del usuario para preservar RLS; no usa `service_role`.
- La ausencia de una fila de perfil no invalida una identidad: nombre y avatar se devuelven como `null`.
- `me` permanece en la frontera HTTP y no aparece como entidad, servicio o paquete portable.

## Consecuencias

- Desktop y Mobile consumen un contrato versionado sin conocer Supabase ni el esquema histórico.
- Un fallo del repositorio de perfiles no se interpreta como una sesión inválida.
- La futura edición del perfil puede añadirse detrás de un puerto de escritura y reglas explícitas; solo entonces se evaluará crear un dominio propio.
- La Web productiva conserva sus rutas actuales y su tabla, conforme al congelamiento arquitectónico.
