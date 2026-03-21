# Multi-User Tenants + Documents Module — Architecture Plan

## Overview & Goals

Este plan extiende kont de un modelo estrictamente 1-usuario-por-tenant a un modelo de colaboración multi-usuario donde el dueño de un tenant puede invitar colaboradores, y un contable (que también puede ser tenant) puede trabajar en múltiples tenants de clientes sin cerrar sesión. Sobre esa base, el módulo Documents (mobile-first) permite compartir archivos estructurados entre contables y sus clientes.

### Invariantes que NO deben romperse

- Cada fila existente en `public.tenants` sigue siendo válida. `tenants.id = auth.uid()` del owner sigue siendo el sujeto de billing.
- `TenantSupabaseSource` usa service role + `.schema(schemaName)` y bypasea RLS — esta es la ruta segura del servidor y no cambia.
- Todos los API routes existentes con `withTenant()` siguen funcionando sin modificaciones (Phase 1 no los toca).

---

## Decisiones de Arquitectura

### Decisión 1 — La tabla de membresías vive en `public`, con clave `(tenant_id, member_id)`

**Razón.** El tenant schema es de un solo Postgres user y existe para aislar datos del tenant. El control de acceso cross-tenant es una responsabilidad de la plataforma, no del tenant, por lo que pertenece a `public` junto a `tenants`. Esto significa que no se necesitan migraciones de schema para la lógica de membresías y el RLS existente queda intacto.

El owner de un tenant siempre es el usuario cuyo `auth.uid()` igual a `tenants.id`. Las filas de membresía son suplementarias.

### Decisión 2 — "Actuar en nombre de" se transporta como HTTP header, verificado server-side

**Razón.** Mutar la cookie/sesión requeriría re-autenticación, que es complejo y rompe la sesión-única multi-tenant. Un path segment en URL (`/t/{tenantId}/...`) fuerza a refactorizar cada link.

**Diseño elegido:** el cliente envía el header `X-Tenant-Id: <ownerUserId>` en cualquier request a un tenant de cliente. El servidor lee ese header, consulta `public.tenant_memberships` para verificar que el usuario llamante tiene membresía válida, y resuelve `schemaName = tenantSchemaName(targetTenantId)`. Si el header está ausente, el comportamiento es idéntico al actual.

Esto es **un query de DB por request** (membership check), rápido con índice adecuado.

### Decisión 3 — `withTenant()` se extiende, no se reemplaza

La signature change es aditiva: el context object gana un campo opcional `actingAs`. Los routes existentes lo ignoran — cero cambios en ellos. Los routes nuevos y el módulo Documents lo usan para permission checks.

```ts
type TenantContext = {
    userId:    string;
    schemaName: string;
    actingAs:  { ownerId: string; role: 'owner' | 'admin' | 'contable' } | null;
}
```

Cuando `actingAs` está presente, los factories reciben `actingAs.ownerId` como schema owner y `userId` como el caller real (importante para audit trails).

### Decisión 4 — `TenantSwitcher` en `AppSidebar`, encima del company selector

El switcher se renderiza solo cuando `allTenants.length > 1`. El estado activo (`kont-active-tenant-id`) se guarda en `localStorage`, igual que `kont-company-id`. Al cambiar de tenant activo, `useCompany()` hace refetch de las empresas del nuevo tenant.

### Decisión 5 — Las tablas del módulo Documents viven en el tenant schema

Los documentos pertenecen a los datos del tenant. Vivir en el tenant schema significa que tienen RLS, están aislados y siguen el mismo path de provisioning que el resto.

### Decisión 6 — Un solo bucket `tenant-documents` con aislamiento por path

Un bucket por tenant sería inmanejable a escala. El aislamiento por path con Storage RLS policies da seguridad equivalente.

**Estructura de path:** `{ownerUserId}/{documentId}/{filename}`

### Decisión 7 — Roles: `owner`, `admin`, `contable`

Owner = sujeto de billing, acceso total. Admin = todo excepto billing. Contable = puede subir y gestionar documentos, no puede modificar nómina ni configuración. Ver la Permission Matrix.

### Decisión 8 — Invitaciones usan token firmado corto-plazo en `public.tenant_invitations`

Link por email con token UUID. El invitado debe tener (o crear) una cuenta kont para aceptar. Expiración: 7 días.

### Decisión 9 — Documents incluido en el plan base, no como add-on de pago

Documents solo tiene valor cuando existe multi-user tenancy. Es el incentivo principal para que el dueño invite a su contable. Se puede monetizar después con límites de storage por plan.

### Decisión 10 — Backfill migration para tenants existentes (no lazy provisioning)

El provisioning lazy requiere detectar tablas faltantes en el hot path. Una migración one-shot itera todos los tenant schemas existentes y agrega las tablas nuevas — patrón ya establecido en este codebase.

---

## Data Model

### `public.tenant_memberships`

```sql
-- Migration 029_tenant_memberships.sql
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    member_id     uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
    role          text        NOT NULL CHECK (role IN ('owner', 'admin', 'contable')),
    invited_by    uuid        NULL REFERENCES auth.users(id),
    accepted_at   timestamptz NULL,      -- NULL = pending
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, member_id)
);

CREATE INDEX idx_memberships_member_id  ON public.tenant_memberships(member_id);
CREATE INDEX idx_memberships_tenant_id  ON public.tenant_memberships(tenant_id);

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

-- Un miembro puede leer sus propias membresías (para listar tenants accesibles)
CREATE POLICY "memberships_own_read" ON public.tenant_memberships
    FOR SELECT USING (member_id = auth.uid());

-- El tenant owner puede leer todas las membresías de su tenant
CREATE POLICY "memberships_owner_read" ON public.tenant_memberships
    FOR SELECT USING (tenant_id = auth.uid());

-- Solo el owner (o service role vía API) puede escribir
CREATE POLICY "memberships_owner_write" ON public.tenant_memberships
    FOR ALL USING (tenant_id = auth.uid());
```

> El owner del tenant también recibe una fila con `role = 'owner'` al momento del provisioning. Así el query "lista todos los tenants a los que pertenece un usuario" es uniforme para todos los roles.

### `public.tenant_invitations`

```sql
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    invited_by   uuid        NOT NULL REFERENCES auth.users(id),
    email        text        NOT NULL,
    role         text        NOT NULL CHECK (role IN ('admin', 'contable')),
    token        uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days',
    accepted_at  timestamptz NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_token     ON public.tenant_invitations(token);
CREATE INDEX idx_invitations_tenant_id ON public.tenant_invitations(tenant_id);
```

### Tenant schema: `document_folders`

```sql
CREATE TABLE IF NOT EXISTS {schema}.document_folders (
    id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    parent_id   text        NULL REFERENCES {schema}.document_folders(id) ON DELETE CASCADE,
    name        text        NOT NULL,
    company_id  text        NULL REFERENCES {schema}.companies(id) ON DELETE SET NULL,
    created_by  uuid        NOT NULL,   -- auth.uid() del creador
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_folders_parent_idx  ON {schema}.document_folders(parent_id);
CREATE INDEX IF NOT EXISTS doc_folders_company_idx ON {schema}.document_folders(company_id);
```

### Tenant schema: `documents`

```sql
CREATE TABLE IF NOT EXISTS {schema}.documents (
    id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    folder_id    text        NULL REFERENCES {schema}.document_folders(id) ON DELETE SET NULL,
    company_id   text        NULL REFERENCES {schema}.companies(id) ON DELETE SET NULL,
    name         text        NOT NULL,
    storage_path text        NOT NULL UNIQUE,   -- {ownerUserId}/{documentId}/{filename}
    mime_type    text,
    size_bytes   bigint,
    uploaded_by  uuid        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_folder_idx  ON {schema}.documents(folder_id);
CREATE INDEX IF NOT EXISTS documents_company_idx ON {schema}.documents(company_id);
```

### Actualización de `provision_tenant_schema()`

La función de provisioning gana los dos bloques `CREATE TABLE` nuevos y al final inserta la fila del owner:

```sql
INSERT INTO public.tenant_memberships (tenant_id, member_id, role, accepted_at)
VALUES (p_user_id, p_user_id, 'owner', now())
ON CONFLICT (tenant_id, member_id) DO NOTHING;
```

---

## API Layer

### `withTenant()` extendido

Archivo: `src/shared/backend/utils/require-tenant.ts`

Nueva lógica:

1. Lee el header `X-Tenant-Id` del request.
2. Si **ausente** → `{ userId, schemaName: tenantSchemaName(userId), actingAs: null }` — idéntico al actual.
3. Si **presente e igual** a `userId` → igual que ausente (own tenant).
4. Si **presente y diferente** → query a `public.tenant_memberships WHERE tenant_id = targetId AND member_id = userId AND accepted_at IS NOT NULL`. Si no existe → 403. Si existe → `{ userId, schemaName: tenantSchemaName(targetId), actingAs: { ownerId: targetId, role } }`.

El membership check va a través de `ServerSupabaseSource` (service role).

### Nuevos API routes — Membresías

```
GET    /api/memberships                — lista todos los tenants donde el caller es miembro
GET    /api/memberships/members        — lista miembros del propio tenant (o X-Tenant-Id si es owner)
POST   /api/memberships/invite         — enviar invitación { email, role }
DELETE /api/memberships/[memberId]     — remover miembro del propio tenant
GET    /api/memberships/accept?token=  — aceptar invitación (público, valida token)
```

### Nuevos API routes — Documentos

```
GET    /api/documents/folders              — listar carpetas (?parentId=, ?companyId=)
POST   /api/documents/folders              — crear carpeta { name, parentId?, companyId? }
DELETE /api/documents/folders/[id]         — eliminar carpeta y contenido
GET    /api/documents                      — listar documentos (?folderId=, ?companyId=)
POST   /api/documents/upload-url           — obtener signed upload URL
POST   /api/documents                      — registrar metadata tras upload exitoso
DELETE /api/documents/[id]                 — eliminar documento (storage + db)
GET    /api/documents/[id]/download-url    — signed download URL (TTL 60s)
```

---

## Frontend Architecture

### Nuevo módulo: `src/modules/memberships/`

```
backend/
  domain/
    membership.ts
    repository/membership.repository.ts
  app/
    get-memberships.use-case.ts
    invite-member.use-case.ts
    remove-member.use-case.ts
    accept-invitation.use-case.ts
  infra/
    repository/supabase-membership.repository.ts
    membership-factory.ts
frontend/
  hooks/
    use-memberships.ts         — lista miembros del propio tenant
    use-active-tenant.ts       — gestiona localStorage kont-active-tenant-id
  components/
    tenant-switcher.tsx        — dropdown en el sidebar
    members-list.tsx           — tabla en settings
    invite-modal.tsx           — dialog para invitar
```

### Nuevo módulo: `src/modules/documents/`

```
backend/
  domain/
    document-folder.ts
    document.ts
    repository/
      document-folder.repository.ts
      document.repository.ts
  app/
    get-folders.use-case.ts
    create-folder.use-case.ts
    delete-folder.use-case.ts
    get-documents.use-case.ts
    register-document.use-case.ts
    delete-document.use-case.ts
    get-download-url.use-case.ts
  infra/
    repository/
      supabase-document-folder.repository.ts
      supabase-document.repository.ts
    documents-factory.ts
frontend/
  hooks/
    use-documents.ts
  components/
    folder-tree.tsx            — navegador recursivo de carpetas
    document-list.tsx          — lista de archivos en carpeta seleccionada
    upload-button.tsx          — file picker mobile-first + progress
    document-viewer.tsx        — nombre, tamaño, CTA de descarga
```

### `use-active-tenant.ts`

Este hook es el state manager del tenant switcher. Hace:

1. Llama a `GET /api/memberships` para obtener todos los tenants accesibles (propio + clientes).
2. Lee `localStorage.getItem('kont-active-tenant-id')` como selección inicial, fallback al propio tenant.
3. Expone `{ activeTenantId, activeTenantName, activeTenantRole, allTenants, switchTenant(id) }`.
4. Guarda `activeTenantId` en `localStorage` al cambiar.

### `apiFetch` central

Nuevo util `src/shared/frontend/utils/api-fetch.ts` que wrappea `fetch()` e inyecta automáticamente `X-Tenant-Id` cuando el tenant activo difiere del propio. Todos los hooks de documentos y membresías lo usan desde el inicio.

### Nuevas páginas

```
app/(app)/documents/          — root del módulo (folder tree + file list), mobile-first
app/(app)/settings/members/   — gestión de miembros (solo owner/admin)
app/(public)/accept-invite/   — flujo de aceptar invitación
```

`documents` → `desktopOnly: false` en `APP_MODULES`. Primer módulo mobile-first de datos reales.

---

## Storage Architecture

### Bucket

- Nombre: `tenant-documents`
- Visibilidad: **privado** (sin acceso público)
- Límite por archivo: 50 MB

### Path convention

```
{tenantOwnerId}/{documentId}/{original_filename}
```

### Upload flow (2 pasos, sin proxy en Next.js)

1. Cliente llama `POST /api/documents/upload-url` con `{ fileName, mimeType, folderId?, companyId? }`.
2. Server genera `documentId`, construye el path, llama `supabase.storage.createSignedUploadUrl(path)` con service role.
3. Retorna `{ documentId, uploadUrl, storagePath }`.
4. Cliente hace `PUT {uploadUrl}` **directamente a Supabase Storage** (evita memoria del Next.js route).
5. On upload success, cliente llama `POST /api/documents` con metadata para persistir la fila en DB.

### Storage RLS

```sql
-- Upload: owner o cualquier miembro aceptado con rol admin o contable
CREATE POLICY "documents_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'tenant-documents'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM public.tenant_memberships
                WHERE tenant_id = ((storage.foldername(name))[1])::uuid
                  AND member_id = auth.uid()
                  AND role IN ('admin', 'contable')
                  AND accepted_at IS NOT NULL
            )
        )
    );

-- Download: owner o cualquier miembro aceptado
CREATE POLICY "documents_download" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'tenant-documents'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM public.tenant_memberships
                WHERE tenant_id = ((storage.foldername(name))[1])::uuid
                  AND member_id = auth.uid()
                  AND accepted_at IS NOT NULL
            )
        )
    );

-- Delete: owner o admin
CREATE POLICY "documents_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'tenant-documents'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM public.tenant_memberships
                WHERE tenant_id = ((storage.foldername(name))[1])::uuid
                  AND member_id = auth.uid()
                  AND role IN ('owner', 'admin')
                  AND accepted_at IS NOT NULL
            )
        )
    );
```

---

## Permission Matrix

| Acción | owner | admin | contable |
|---|:---:|:---:|:---:|
| Invitar miembros | ✓ | ✓ (solo rol contable) | ✗ |
| Remover miembros | ✓ | ✓ (no-owners) | ✗ |
| Ver todos los miembros | ✓ | ✓ | ✗ |
| Usar tenant switcher | ✓ | ✓ | ✓ |
| Crear/renombrar/eliminar carpeta | ✓ | ✓ | ✓ |
| Subir documento | ✓ | ✓ | ✓ |
| Ver/descargar documento | ✓ | ✓ | ✓ |
| Eliminar documento | ✓ | ✓ | Solo propios |
| Ver nómina/inventario (Phase 2) | ✓ | ✓ | Read-only |
| Editar nómina/inventario | ✓ | ✓ | ✗ |
| Gestionar billing | ✓ | ✗ | ✗ |
| Cancelar propia membresía | — | ✓ | ✓ |

Phase 1 solo enforcea permisos de Documents. El acceso read-only del contable a nómina/inventario se difiere a Phase 2.

---

## Migration Plan

### Migration 029 — Memberships & invitations (public schema)

Crea `public.tenant_memberships` y `public.tenant_invitations`. Hace seed de filas de owner para todos los tenants existentes:

```sql
INSERT INTO public.tenant_memberships (tenant_id, member_id, role, accepted_at)
SELECT id, id, 'owner', created_at FROM public.tenants
ON CONFLICT (tenant_id, member_id) DO NOTHING;
```

### Migration 030 — Document tables (tenant schemas)

Actualiza `provision_tenant_schema()` para incluir `document_folders` y `documents`. Luego backfill de todos los schemas existentes:

```sql
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.tenants LOOP
        PERFORM public.provision_documents_tables(r.id);
    END LOOP;
END;
$$;
```

Donde `provision_documents_tables(p_user_id)` es una función helper nueva con solo los dos bloques `CREATE TABLE`, idempotente.

### Migration 031 — Storage bucket RLS

El bucket se crea vía CLI (`supabase storage create tenant-documents`). Las Storage RLS policies se aplican como SQL migration.

---

## Phase Breakdown

### Phase 1 — Infraestructura multi-user (foundation)

**Goal:** el dueño de un tenant puede invitar a un contable, quien puede cambiar al tenant de ese cliente y ver su lista de empresas.

Deliverables:
- [ ] Migration 029 (tablas de membresías e invitaciones)
- [ ] `withTenant()` extendido con resolución de `X-Tenant-Id`
- [ ] `use-active-tenant.ts` hook
- [ ] `TenantSwitcher` component
- [ ] `AppSidebar` actualizado con `TenantSwitcher`
- [ ] `useCompany()` pasa `X-Tenant-Id` cuando actúa en tenant de cliente
- [ ] API routes de membresías: `/api/memberships` (GET/POST/DELETE) + `/api/memberships/accept`
- [ ] Settings > Members page
- [ ] Página de aceptar invitación (`app/(public)/accept-invite/`)

### Phase 2 — Módulo Documents

**Goal:** el contable puede subir archivos al tenant del cliente; owner/admin pueden ver y descargar.

Deliverables:
- [ ] Migration 030 (tablas de documentos en tenant schemas)
- [ ] Migration 031 (Storage bucket + RLS)
- [ ] Módulo documents (Clean Architecture completo)
- [ ] API routes de documentos
- [ ] `folder-tree.tsx`, `document-list.tsx`, `upload-button.tsx`, `document-viewer.tsx`
- [ ] Página `app/(app)/documents/`
- [ ] Agregar `documents` a `APP_MODULES` en `navigation.ts` (`desktopOnly: false`)
- [ ] Entrada en sidebar

### Phase 3 — Acceso read-only del contable a módulos existentes (futuro)

**Goal:** un contable actuando en el tenant de un cliente puede ver historial de nómina y reportes de inventario pero no puede hacer cambios.

Deliverables:
- [ ] Utility de role guard por route (lee `actingAs.role`)
- [ ] Guards en routes de nómina, inventario y empresas
- [ ] UI diferenciada: el contable ve vista read-only sin botones de edición

---

## Out of Scope (explícito)

- Notificaciones en tiempo real (Supabase Realtime / email push)
- Versionado de documentos — el modelo inicial es overwrite-replace
- Cuotas de storage por plan — `max_storage_gb` puede agregarse en billing más adelante
- Audit log (quién vio / descargó)
- Escritura del contable en nómina/inventario — solo lectura en Phase 3
- Compartir carpetas entre tenants
- Membresías en el admin panel (`app/admin/`)
- SSO u OAuth para aceptar invitaciones
- Billing por seat
- Push notifications vía PWA service worker

---

## Archivos Críticos para Implementación

| Archivo | Qué modificar |
|---|---|
| `src/shared/backend/utils/require-tenant.ts` | Extender `withTenant()` para leer `X-Tenant-Id`, query `tenant_memberships`, inyectar `actingAs` |
| `supabase/migrations/002_provision_tenant_function.sql` | Patrón de referencia para migrations 029 y 030 |
| `src/shared/frontend/components/app-sidebar.tsx` | Insertar `TenantSwitcher`, agregar entrada de nav `documents` |
| `src/modules/companies/frontend/hooks/use-companies.ts` | Pasar `X-Tenant-Id` en `apiFetch` cuando el tenant activo no es el propio |
| `src/modules/inventory/backend/infra/inventory-factory.ts` | Patrón de referencia para `documents-factory.ts` |
| `src/shared/frontend/navigation.ts` | Agregar `documents` con `desktopOnly: false` |
