# Plan de Ataque — Multi-User Tenants + Módulo Documents (Opción A)

**Mecanismo:** header `X-Tenant-Id` verificado server-side contra `public.tenant_memberships`.
**Regla:** si el header está ausente → comportamiento idéntico al actual. Cero breaking changes.

---

## Phase 1 — Infraestructura Multi-User

### BLOQUE 1 · Base de datos

#### Tarea 1.1 — Migration 029: tablas de membresías e invitaciones

Crear `supabase/migrations/029_tenant_memberships.sql`:

```sql
-- public.tenant_memberships
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    member_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role          text        NOT NULL CHECK (role IN ('owner', 'admin', 'contable')),
    invited_by    uuid        NULL REFERENCES auth.users(id),
    accepted_at   timestamptz NULL,
    revoked_at    timestamptz NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, member_id)
);

CREATE INDEX idx_memberships_member_id ON public.tenant_memberships(member_id);
CREATE INDEX idx_memberships_tenant_id ON public.tenant_memberships(tenant_id);

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

-- Miembro lee sus propias membresías activas
CREATE POLICY "memberships_member_read" ON public.tenant_memberships
    FOR SELECT USING (member_id = auth.uid() AND revoked_at IS NULL);

-- Owner lee todas las membresías de su tenant
CREATE POLICY "memberships_owner_read" ON public.tenant_memberships
    FOR SELECT USING (tenant_id = auth.uid());

-- Solo el owner puede escribir (inserts/updates/deletes via service role en API)
CREATE POLICY "memberships_owner_write" ON public.tenant_memberships
    FOR ALL USING (tenant_id = auth.uid());

-- public.tenant_invitations
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

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_owner_read" ON public.tenant_invitations
    FOR SELECT USING (tenant_id = auth.uid() OR invited_by = auth.uid());

-- Seed: crear fila owner para todos los tenants existentes
INSERT INTO public.tenant_memberships (tenant_id, member_id, role, accepted_at)
SELECT id, id, 'owner', created_at FROM public.tenants
ON CONFLICT (tenant_id, member_id) DO NOTHING;
```

#### Tarea 1.2 — Actualizar `provision_tenant_schema()` para nuevos usuarios

Al final de `provision_tenant_schema()` en `002_provision_tenant_function.sql`, agregar el INSERT de membresía owner. Esto va **después** del INSERT en `public.tenants`:

```sql
-- Registrar al owner como miembro de su propio tenant
INSERT INTO public.tenant_memberships (tenant_id, member_id, role, accepted_at)
VALUES (p_user_id, p_user_id, 'owner', now())
ON CONFLICT (tenant_id, member_id) DO NOTHING;
```

> Nota: modificar la función con `CREATE OR REPLACE FUNCTION` en la migration 029, no editar el archivo 002 directamente.

---

### BLOQUE 2 · API Layer

#### Tarea 2.1 — Extender `withTenant()` para leer `X-Tenant-Id`

Archivo: `src/shared/backend/utils/require-tenant.ts`

Nueva lógica de `requireTenant(req: Request)`:

```
1. getUser() con cookie — igual que hoy → si falla → 401
2. Leer header X-Tenant-Id de req
3. Si ausente o igual a userId:
     → return { userId, schemaName: tenantSchemaName(userId), actingAs: null }
4. Si diferente:
     → query ServerSupabaseSource:
         SELECT role FROM public.tenant_memberships
         WHERE tenant_id = targetId
           AND member_id = userId
           AND accepted_at IS NOT NULL
           AND revoked_at IS NULL
     → si no existe → throw TenantForbiddenError (403)
     → si existe → return { userId, schemaName: tenantSchemaName(targetId), actingAs: { ownerId: targetId, role } }
```

Tipos nuevos:

```ts
export type ActingAs = { ownerId: string; role: 'owner' | 'admin' | 'contable' };

export type TenantContext = {
    userId:    string;
    schemaName: string;
    actingAs:  ActingAs | null;
};
```

`withTenant()` ahora pasa `TenantContext` al handler. Los routes existentes siguen funcionando porque desestructuran solo `{ userId, schemaName }` — `actingAs` se ignora silenciosamente.

Agregar `TenantForbiddenError`:

```ts
export class TenantForbiddenError extends Error {
    readonly status = 403;
    constructor() { super('Sin acceso a este tenant'); }
}
```

Actualizar el catch en `withTenant()` para manejar ambos errores.

#### Tarea 2.2 — `apiFetch` central con inyección automática de `X-Tenant-Id`

Crear `src/shared/frontend/utils/api-fetch.ts`:

```ts
// Lee activeTenantId de localStorage y lo inyecta si difiere del userId propio
export async function apiFetch(url: string, options?: RequestInit): Promise<Response>
```

Este util será usado por todos los hooks nuevos (membresías, documentos). Los hooks existentes no se migran todavía — no es bloqueante.

#### Tarea 2.3 — API routes de membresías

Crear los siguientes routes bajo `app/api/memberships/`:

| Route | Método | Descripción | Permisos |
|---|---|---|---|
| `app/api/memberships/route.ts` | GET | Lista todos los tenants donde el caller es miembro activo | Cualquier user autenticado |
| `app/api/memberships/members/route.ts` | GET | Lista miembros del tenant activo (X-Tenant-Id) | owner, admin |
| `app/api/memberships/invite/route.ts` | POST | Crea invitación `{ email, role }`, envía email | owner, admin (solo rol contable) |
| `app/api/memberships/[memberId]/route.ts` | DELETE | Revoca membresía (`revoked_at = now()`) | owner (cualquier), admin (no-owners) |
| `app/api/memberships/accept/route.ts` | GET | `?token=` — valida token, crea membresía, redirige | Público |

**Lógica del endpoint GET `/api/memberships`** (el más importante para el switcher):

```ts
// No usa withTenant() — solo necesita userId
// Query:
SELECT tm.tenant_id, tm.role, t.schema_name,
       u.email as tenant_email
FROM public.tenant_memberships tm
JOIN public.tenants t ON t.id = tm.tenant_id
JOIN auth.users u ON u.id = tm.tenant_id
WHERE tm.member_id = userId
  AND tm.accepted_at IS NOT NULL
  AND tm.revoked_at IS NULL
ORDER BY tm.role = 'owner' DESC, tm.created_at ASC
```

Retorna lista de tenants accesibles con `{ tenantId, role, tenantEmail, isOwn: tenantId === userId }`.

**Lógica del endpoint GET `/api/memberships/accept?token=`**:

```
1. Buscar invitación por token donde accepted_at IS NULL y expires_at > now()
2. Si no existe → redirect /accept-invite?error=invalid
3. Si el usuario no está autenticado → redirect /sign-in?redirect=/accept-invite?token=...
4. Verificar que el email de la invitación coincide con el email del usuario autenticado
5. INSERT en tenant_memberships (tenant_id, member_id=userId, role, invited_by, accepted_at=now())
6. UPDATE tenant_invitations SET accepted_at = now() WHERE id = invitationId
7. Redirect a la app con X-Tenant-Id ya establecido en localStorage (via redirect param)
```

---

### BLOQUE 3 · Frontend State

#### Tarea 3.1 — Hook `use-active-tenant.ts`

Crear `src/modules/memberships/frontend/hooks/use-active-tenant.ts`:

```ts
// State:
//   allTenants: { tenantId, role, tenantEmail, isOwn }[]
//   activeTenantId: string
//   activeTenantRole: 'owner' | 'admin' | 'contable'
//   isActingOnBehalf: boolean  (activeTenantId !== ownUserId)
//
// Actions:
//   switchTenant(tenantId: string): void
//   clearActiveTenant(): void
//
// localStorage key: 'kont-active-tenant-id'
// Llama GET /api/memberships al montar
// Si el stored id ya no está en la lista (membresía revocada), fallback al propio tenant
```

#### Tarea 3.2 — Contexto global del tenant activo

Crear `src/modules/memberships/frontend/context/active-tenant-context.tsx`:

- Wrappea `use-active-tenant.ts` en un React Context
- Expone `useActiveTenant()` hook
- Agregar `ActiveTenantProvider` al árbol en `app/(app)/layout.tsx`, wrappea `CompanyProvider`

#### Tarea 3.3 — `TenantSwitcher` component

Crear `src/modules/memberships/frontend/components/tenant-switcher.tsx`:

- Solo se renderiza si `allTenants.length > 1`
- Posición en sidebar: entre el bloque del logo y el company selector
- Diseño: dropdown idéntico al company selector existente
- Muestra el `tenantEmail` del tenant activo como label
- Badge con el rol cuando `isActingOnBehalf` es true (ej. "Contable")
- Al seleccionar un tenant: `switchTenant(id)` + `router.refresh()` para recargar company context

#### Tarea 3.4 — Actualizar `AppSidebar` para mostrar `TenantSwitcher`

Archivo: `src/shared/frontend/components/app-sidebar.tsx`

- Importar y montar `TenantSwitcher` encima del company selector
- Envolver la sección relevante en `Suspense` si hace falta (el hook hace fetch)

#### Tarea 3.5 — Actualizar `useCompany()` para respetar el tenant activo

Archivo: `src/modules/companies/frontend/hooks/use-companies.ts`

- Importar `useActiveTenant()`
- Pasar `'X-Tenant-Id': activeTenantId` en el `fetch` cuando `isActingOnBehalf === true`
- Agregar `activeTenantId` como dependency de `useEffect`/`reload` para refetch automático al cambiar de tenant

---

### BLOQUE 4 · Páginas

#### Tarea 4.1 — Página Settings > Members

Crear `app/(app)/settings/members/page.tsx`:

- Tabla de miembros actuales con nombre/email, rol, fecha de ingreso, botón revocar
- Botón "Invitar miembro" → abre modal
- Modal de invitación: campo email, selector de rol (admin / contable), CTA enviar
- Solo visible si `activeTenantRole === 'owner' || activeTenantRole === 'admin'`
- Si el usuario es `contable` actuando en nombre de un cliente → redirigir a `/`

#### Tarea 4.2 — Página de aceptar invitación

Crear `app/(public)/accept-invite/page.tsx`:

- Lee `?token=` de los search params
- Si no hay sesión → muestra CTA "Crea tu cuenta en kont para aceptar esta invitación" con link a `/sign-up`
- Si hay sesión → llama `GET /api/memberships/accept?token=` → spinner → redirige
- Si error (`?error=invalid`) → muestra mensaje "Invitación inválida o expirada"

---

## Phase 2 — Módulo Documents

### BLOQUE 5 · Base de datos

#### Tarea 5.1 — Migration 030: tablas de documentos en tenant schemas

Crear `supabase/migrations/030_documents_tenant_tables.sql`:

```sql
-- Helper function: agrega tablas de documentos a un schema existente (idempotente)
CREATE OR REPLACE FUNCTION public.provision_documents_tables(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schema text;
BEGIN
    v_schema := 'tenant_' || replace(p_user_id::text, '-', '');

    -- document_folders
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.document_folders (
            id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            parent_id   text        NULL REFERENCES %I.document_folders(id) ON DELETE CASCADE,
            name        text        NOT NULL,
            company_id  text        NULL REFERENCES %I.companies(id) ON DELETE SET NULL,
            created_by  uuid        NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS doc_folders_parent_idx  ON %I.document_folders(parent_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS doc_folders_company_idx ON %I.document_folders(company_id)', v_schema);

    -- documents
    EXECUTE format($tbl$
        CREATE TABLE IF NOT EXISTS %I.documents (
            id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            folder_id    text        NULL REFERENCES %I.document_folders(id) ON DELETE SET NULL,
            company_id   text        NULL REFERENCES %I.companies(id) ON DELETE SET NULL,
            name         text        NOT NULL,
            storage_path text        NOT NULL UNIQUE,
            mime_type    text,
            size_bytes   bigint,
            uploaded_by  uuid        NOT NULL,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        )
    $tbl$, v_schema, v_schema, v_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS documents_folder_idx  ON %I.documents(folder_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS documents_company_idx ON %I.documents(company_id)', v_schema);

    -- RLS: misma política que el resto del schema (owner literal embebido)
    EXECUTE format('ALTER TABLE %I.document_folders ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.documents        ENABLE ROW LEVEL SECURITY', v_schema);

    EXECUTE format(
        'CREATE POLICY IF NOT EXISTS tenant_owner ON %I.document_folders FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );
    EXECUTE format(
        'CREATE POLICY IF NOT EXISTS tenant_owner ON %I.documents FOR ALL USING (auth.uid() = %L::uuid)',
        v_schema, p_user_id
    );

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.document_folders TO authenticated', v_schema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.documents        TO authenticated', v_schema);
END;
$$;

-- Backfill: agregar tablas a todos los tenants existentes
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.tenants LOOP
        PERFORM public.provision_documents_tables(r.id);
    END LOOP;
END;
$$;

-- Actualizar provision_tenant_schema() para que nuevos tenants incluyan documentos
-- (se hace con CREATE OR REPLACE de la función completa incluyendo la llamada a provision_documents_tables)
```

#### Tarea 5.2 — Migration 031: Storage bucket RLS

Crear `supabase/migrations/031_documents_storage_rls.sql`:

```sql
-- Nota: el bucket 'tenant-documents' se crea via CLI antes de correr esta migration:
-- supabase storage create tenant-documents

-- Upload: owner o miembro activo con rol admin/contable
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
                  AND revoked_at IS NULL
            )
        )
    );

-- Download: owner o cualquier miembro activo
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
                  AND revoked_at IS NULL
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
                  AND revoked_at IS NULL
            )
        )
    );
```

---

### BLOQUE 6 · Módulo Documents (Clean Architecture)

Seguir la convención de inventario (`*.use-case.ts`, `rpc-*.repository.ts` → en este caso `supabase-*.repository.ts` porque son queries simples, no RPCs).

#### Estructura de archivos

```
src/modules/documents/
  backend/
    domain/
      document-folder.ts           # interface DocumentFolder
      document.ts                  # interface Document
      repository/
        document-folder.repository.ts  # IDocumentFolderRepository
        document.repository.ts         # IDocumentRepository
    app/
      get-folders.use-case.ts
      create-folder.use-case.ts
      delete-folder.use-case.ts
      get-documents.use-case.ts
      register-document.use-case.ts
      delete-document.use-case.ts
      get-upload-url.use-case.ts     # genera signed upload URL
      get-download-url.use-case.ts   # genera signed download URL (TTL 60s)
    infra/
      repository/
        supabase-document-folder.repository.ts
        supabase-document.repository.ts
      documents-factory.ts           # recibe ownerId (el tenant schema owner)
  frontend/
    hooks/
      use-documents.ts
    components/
      folder-tree.tsx
      document-list.tsx
      upload-button.tsx
      document-viewer.tsx
```

#### Notas de implementación del factory

`documents-factory.ts` recibe `ownerId: string` (el dueño del schema, que puede ser distinto del usuario logueado):

```ts
export function getDocumentsActions(ownerId: string) {
    const source = new TenantSupabaseSource(tenantSchemaName(ownerId));
    // ...
}
```

En el API route:

```ts
export const POST = withTenant(async (req, { userId, schemaName, actingAs }) => {
    const ownerId = actingAs?.ownerId ?? userId;
    const actions = getDocumentsActions(ownerId);
    // ...
});
```

---

### BLOQUE 7 · API routes de documentos

Crear bajo `app/api/documents/`:

| Route | Método | Body/Params | Acción |
|---|---|---|---|
| `folders/route.ts` | GET | `?parentId=&companyId=` | Listar carpetas |
| `folders/route.ts` | POST | `{ name, parentId?, companyId? }` | Crear carpeta |
| `folders/[id]/route.ts` | DELETE | — | Eliminar carpeta (cascade) |
| `route.ts` | GET | `?folderId=&companyId=` | Listar documentos |
| `route.ts` | POST | `{ documentId, name, storagePath, mimeType, sizeBytes, folderId?, companyId? }` | Registrar metadata |
| `upload-url/route.ts` | POST | `{ fileName, mimeType, folderId?, companyId? }` | Generar signed upload URL |
| `[id]/route.ts` | DELETE | — | Eliminar (storage + db) |
| `[id]/download-url/route.ts` | GET | — | Signed download URL (60s TTL) |

**Upload flow (2 pasos):**

```
1. POST /api/documents/upload-url
   → server genera documentId (uuid)
   → construye storagePath: {ownerId}/{documentId}/{sanitized_filename}
   → llama supabase.storage.from('tenant-documents').createSignedUploadUrl(storagePath)
   → retorna { documentId, uploadUrl, storagePath }

2. Cliente hace PUT uploadUrl con el archivo (directo a Supabase Storage, sin proxy)

3. POST /api/documents
   → persiste la fila en {schema}.documents
```

**Permission check dentro de los handlers:**

```ts
// Eliminar documento: solo propietario del upload o admin/owner
const isUploader  = document.uploaded_by === userId;
const isAdminPlus = !actingAs || actingAs.role === 'owner' || actingAs.role === 'admin';

if (!isUploader && !isAdminPlus) {
    return Response.json({ error: 'Sin permiso' }, { status: 403 });
}
```

---

### BLOQUE 8 · Frontend del módulo Documents

#### Tarea 8.1 — `use-documents.ts`

```ts
// State: folders (árbol), selectedFolderId, documents, loading, error
// Actions: createFolder, deleteFolder, selectFolder, uploadDocument, deleteDocument, getDownloadUrl
// Usa apiFetch() para inyectar X-Tenant-Id automáticamente
```

#### Tarea 8.2 — `folder-tree.tsx`

- Lista de carpetas con indentación por `parent_id`
- Click → selecciona carpeta (actualiza `selectedFolderId`)
- Botón "+" al hover → crea subcarpeta (inline input)
- Botón "..." → menú: renombrar, eliminar

#### Tarea 8.3 — `document-list.tsx`

- Grid o lista de archivos de la carpeta seleccionada
- Cada item: icono por `mime_type`, nombre, tamaño, fecha, botones descargar/eliminar
- Empty state: "No hay documentos — sube el primero"

#### Tarea 8.4 — `upload-button.tsx`

- Input `<input type="file" multiple>` oculto
- Botón visible "Subir archivos" (touch target ≥ 44px)
- Progreso: barra por cada archivo (`XMLHttpRequest` para progreso real o `fetch` simple)
- Secuencia: `upload-url` → `PUT` → `POST /api/documents`

#### Tarea 8.5 — Página `app/(app)/documents/page.tsx`

Layout mobile-first en dos paneles:
- Mobile: panel izquierdo (carpetas) es drawer que se abre con botón
- Desktop (xl): split view fijo — carpetas a la izquierda, archivos a la derecha

#### Tarea 8.6 — Registrar módulo en navegación

En `src/shared/frontend/navigation.ts`:

```ts
{ id: "documents", label: "Documentos", href: "/documents", desktopOnly: false }
```

En `app-sidebar.tsx`: agregar entrada del módulo. Sin `useModuleAccess` gate (incluido en plan base). Sin `DesktopOnlyGuard`.

---

## Orden de Ejecución

```
Phase 1:
  1.1 → 1.2  (DB migrations)
  2.1        (withTenant extendido — CRÍTICO, todo lo demás depende de esto)
  2.2        (apiFetch)
  3.1 → 3.2  (active tenant hook + context)
  2.3        (API routes membresías)
  3.3 → 3.4  (TenantSwitcher + Sidebar)
  3.5        (useCompany actualizado)
  4.1 → 4.2  (páginas)

Phase 2:
  5.1        (migration tablas documentos)
  5.2        (migration storage RLS + crear bucket)
  6          (módulo Clean Architecture completo)
  7          (API routes documentos)
  8.1 → 8.6  (frontend + página + navegación)
```

---

## Archivos a tocar (resumen)

### Phase 1

| Archivo | Qué hacer |
|---|---|
| `supabase/migrations/029_tenant_memberships.sql` | Crear (nuevo) |
| `src/shared/backend/utils/require-tenant.ts` | Extender `withTenant()` + tipos `TenantContext`, `ActingAs` |
| `src/shared/frontend/utils/api-fetch.ts` | Crear (nuevo) |
| `src/modules/memberships/` | Crear módulo completo (nuevo) |
| `app/api/memberships/` | Crear routes (nuevo) |
| `app/(app)/settings/members/page.tsx` | Crear (nuevo) |
| `app/(public)/accept-invite/page.tsx` | Crear (nuevo) |
| `app/(app)/layout.tsx` | Agregar `ActiveTenantProvider` |
| `src/shared/frontend/components/app-sidebar.tsx` | Insertar `TenantSwitcher` |
| `src/modules/companies/frontend/hooks/use-companies.ts` | Pasar `X-Tenant-Id` |

### Phase 2

| Archivo | Qué hacer |
|---|---|
| `supabase/migrations/030_documents_tenant_tables.sql` | Crear (nuevo) |
| `supabase/migrations/031_documents_storage_rls.sql` | Crear (nuevo) |
| `src/modules/documents/` | Crear módulo completo (nuevo) |
| `app/api/documents/` | Crear routes (nuevo) |
| `app/(app)/documents/page.tsx` | Crear (nuevo) |
| `src/shared/frontend/navigation.ts` | Agregar entrada `documents` |
| `src/shared/frontend/components/app-sidebar.tsx` | Agregar nav entry `documents` |

---

## Checkpoints de validación

### Al terminar Phase 1

- [ ] Un usuario A puede invitar a usuario B como `contable`
- [ ] El usuario B acepta la invitación y ve el tenant de A en el `TenantSwitcher`
- [ ] Al cambiar a tenant de A, las empresas del tenant A aparecen en el sidebar
- [ ] Una request con `X-Tenant-Id` inválido retorna 403
- [ ] Si el owner revoca la membresía de B, el próximo request de B al tenant de A retorna 403
- [ ] Los routes existentes (nómina, inventario, empresas) funcionan sin cambios

### Al terminar Phase 2

- [ ] Un contable actuando en el tenant del cliente puede crear carpetas y subir archivos
- [ ] El owner/admin del tenant puede ver y descargar esos archivos
- [ ] Un contable no puede eliminar archivos subidos por otro usuario
- [ ] Un usuario sin membresía no puede leer el storage path del tenant (Storage RLS)
- [ ] El módulo aparece en la navegación mobile y no tiene `DesktopOnlyGuard`
