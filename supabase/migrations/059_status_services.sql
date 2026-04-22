-- =============================================================================
-- 059_status_services.sql
-- Status page para portales gubernamentales venezolanos (SENIAT, IVSS, INCES,
-- BANAVIH, MinTra, SAREN, SUDEBAN, BCV). Expuesto en /herramientas/status
-- como herramienta gratuita. Lectura pública, escritura sólo service_role.
-- =============================================================================

-- 1. Catálogo de servicios monitoreados -----------------------------------------
CREATE TABLE IF NOT EXISTS public.status_services (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                   text NOT NULL UNIQUE,
    name                   text NOT NULL,
    description            text,
    url                    text NOT NULL,
    category               text NOT NULL CHECK (category IN ('fiscal','laboral','mercantil')),
    logo_url               text,
    check_method           text NOT NULL DEFAULT 'GET' CHECK (check_method IN ('GET','HEAD')),
    timeout_ms             int  NOT NULL DEFAULT 10000,
    degraded_threshold_ms  int  NOT NULL DEFAULT 3000,
    active                 boolean NOT NULL DEFAULT true,
    display_order          int  NOT NULL DEFAULT 0,
    created_at             timestamptz NOT NULL DEFAULT now()
);

-- 2. Historia de checks (server + crowdsource client) ---------------------------
CREATE TABLE IF NOT EXISTS public.status_checks (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id         uuid NOT NULL REFERENCES public.status_services(id) ON DELETE CASCADE,
    checked_at         timestamptz NOT NULL DEFAULT now(),
    status             text NOT NULL CHECK (status IN ('operational','degraded','down')),
    response_time_ms   int,
    http_status        int,
    error_message      text,
    source             text NOT NULL DEFAULT 'server' CHECK (source IN ('server','client')),
    client_fingerprint text
);

CREATE INDEX IF NOT EXISTS status_checks_service_at_idx
    ON public.status_checks (service_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS status_checks_service_source_at_idx
    ON public.status_checks (service_id, source, checked_at DESC);

CREATE INDEX IF NOT EXISTS status_checks_fingerprint_idx
    ON public.status_checks (client_fingerprint, service_id, checked_at DESC)
    WHERE client_fingerprint IS NOT NULL;

-- 3. Incidentes (auto-generados; opcional manual en el futuro) ------------------
CREATE TABLE IF NOT EXISTS public.status_incidents (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id  uuid NOT NULL REFERENCES public.status_services(id) ON DELETE CASCADE,
    started_at  timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    description text
);

CREATE INDEX IF NOT EXISTS status_incidents_service_started_idx
    ON public.status_incidents (service_id, started_at DESC);

-- 4. RLS: lectura pública (anon), escritura sólo service_role -------------------
ALTER TABLE public.status_services  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_checks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "status_services_public_read"  ON public.status_services;
DROP POLICY IF EXISTS "status_checks_public_read"    ON public.status_checks;
DROP POLICY IF EXISTS "status_incidents_public_read" ON public.status_incidents;

CREATE POLICY "status_services_public_read"
    ON public.status_services FOR SELECT USING (true);

CREATE POLICY "status_checks_public_read"
    ON public.status_checks   FOR SELECT USING (true);

CREATE POLICY "status_incidents_public_read"
    ON public.status_incidents FOR SELECT USING (true);

-- 5. Seed de los 10 servicios del MVP -------------------------------------------
INSERT INTO public.status_services (slug, name, description, url, category, display_order) VALUES
    ('seniat',               'SENIAT',                 'Portal principal del Servicio Nacional Integrado de Administración Aduanera y Tributaria',
                                                       'https://www.seniat.gob.ve',                    'fiscal',     1),
    ('seniat-declaraciones', 'SENIAT Declaraciones',   'Sistema en línea para declaración de IVA, ISLR y otros tributos',
                                                       'https://declaraciones.seniat.gob.ve',          'fiscal',     2),
    ('seniat-facturacion',   'SENIAT Facturación',     'Portal de facturación electrónica',
                                                       'https://facturacion.seniat.gob.ve',            'fiscal',     3),
    ('ivss',                 'IVSS',                   'Instituto Venezolano de los Seguros Sociales',
                                                       'http://www.ivss.gob.ve',                       'laboral',   10),
    ('inces',                'INCES',                  'Instituto Nacional de Capacitación y Educación Socialista',
                                                       'https://www.inces.gob.ve',                     'laboral',   11),
    ('banavih',              'BANAVIH / FAOV',         'Banco Nacional de Vivienda y Hábitat — Fondo de Ahorro Obligatorio',
                                                       'https://www.banavih.gob.ve',                   'laboral',   12),
    ('mintra',               'Ministerio del Trabajo', 'Ministerio del Poder Popular para el Proceso Social de Trabajo',
                                                       'http://www.mintra.gob.ve',                     'laboral',   13),
    ('saren',                'SAREN',                  'Servicio Autónomo de Registros y Notarías',
                                                       'https://www.saren.gob.ve',                     'mercantil', 20),
    ('sudeban',              'SUDEBAN',                'Superintendencia de las Instituciones del Sector Bancario',
                                                       'https://www.sudeban.gob.ve',                   'mercantil', 21),
    ('bcv',                  'BCV',                    'Banco Central de Venezuela',
                                                       'https://www.bcv.org.ve',                       'mercantil', 22)
ON CONFLICT (slug) DO NOTHING;
