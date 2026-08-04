-- 133_shared_documents_pilot.sql
-- Document metadata in the shared schema. Storage objects keep their existing
-- paths; tenant_id protects metadata and allows policies to scope access.

CREATE TABLE IF NOT EXISTS public.shared_document_folders (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    parent_id text,
    name text NOT NULL,
    company_id text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,parent_id) REFERENCES public.shared_document_folders(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.shared_documents (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL,
    folder_id text,
    company_id text,
    name text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    size_bytes bigint,
    uploaded_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,storage_path),
    FOREIGN KEY (tenant_id,folder_id) REFERENCES public.shared_document_folders(tenant_id,id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS shared_document_folders_company_idx ON public.shared_document_folders(tenant_id,company_id);
CREATE INDEX IF NOT EXISTS shared_document_folders_parent_idx ON public.shared_document_folders(tenant_id,parent_id);
CREATE INDEX IF NOT EXISTS shared_documents_company_idx ON public.shared_documents(tenant_id,company_id);
CREATE INDEX IF NOT EXISTS shared_documents_folder_idx ON public.shared_documents(tenant_id,folder_id);

ALTER TABLE public.shared_document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_document_folders_member_access ON public.shared_document_folders;
DROP POLICY IF EXISTS shared_documents_member_access ON public.shared_documents;
CREATE POLICY shared_document_folders_member_access ON public.shared_document_folders FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_document_folders.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_document_folders.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));
CREATE POLICY shared_documents_member_access ON public.shared_documents FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_documents.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=shared_documents.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL));

DO $$
DECLARE r record; n bigint;
BEGIN
 FOR r IN SELECT id,schema_name FROM public.tenants LOOP
  EXECUTE format('SELECT count(*) FROM %I.document_folders f LEFT JOIN public.shared_companies c ON c.tenant_id=%L::uuid AND c.id=f.company_id WHERE f.company_id IS NOT NULL AND c.id IS NULL',r.schema_name,r.id) INTO n;
  IF n>0 THEN RAISE EXCEPTION 'Tenant % document folders without same-tenant company: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.document_folders child LEFT JOIN %I.document_folders parent ON parent.id=child.parent_id WHERE child.parent_id IS NOT NULL AND parent.id IS NULL',r.schema_name,r.schema_name) INTO n;
  IF n>0 THEN RAISE EXCEPTION 'Tenant % document folders without local parent: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.documents d LEFT JOIN %I.document_folders f ON f.id=d.folder_id WHERE d.folder_id IS NOT NULL AND f.id IS NULL',r.schema_name,r.schema_name) INTO n;
  IF n>0 THEN RAISE EXCEPTION 'Tenant % documents without local folder: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.documents d LEFT JOIN public.shared_companies c ON c.tenant_id=%L::uuid AND c.id=d.company_id WHERE d.company_id IS NOT NULL AND c.id IS NULL',r.schema_name,r.id) INTO n;
  IF n>0 THEN RAISE EXCEPTION 'Tenant % documents without same-tenant company: %',r.id,n; END IF;
  EXECUTE format($q$INSERT INTO public.shared_document_folders(tenant_id,id,parent_id,name,company_id,created_by,created_at,updated_at) SELECT %L::uuid,id,parent_id,name,company_id,created_by,created_at,updated_at FROM %I.document_folders ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_documents(tenant_id,id,folder_id,company_id,name,storage_path,mime_type,size_bytes,uploaded_by,created_at,updated_at) SELECT %L::uuid,id,folder_id,company_id,name,storage_path,mime_type,size_bytes,uploaded_by,created_at,updated_at FROM %I.documents ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
 END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_document_folders,public.shared_documents TO authenticated;
