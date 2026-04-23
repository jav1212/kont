-- =============================================================================
-- 064_seniat_reminder_subscriptions.sql
-- Crea la tabla global public.seniat_reminder_subscriptions para el sistema
-- de recordatorios por email del Calendario Tributario SENIAT.
--
-- Propósito:
--   Permite que los usuarios autenticados se suscriban a alertas por email
--   de sus obligaciones fiscales venezolanas. Los recordatorios se envían
--   N días antes del vencimiento (1-7, defecto: 3) vía Resend.
--
-- Diferencia con otras tablas del sistema:
--   Esta tabla vive en el schema PUBLIC (no en el schema por-tenant) porque
--   los recordatorios son una feature global del usuario, no se segregan por
--   empresa ni por tenant. Un mismo usuario puede tener suscripciones para
--   múltiples RIF.
--
-- Cron:
--   app/api/cron/seniat-reminders/route.ts — diario 08:00 VET (12:00 UTC)
--   configurado en vercel.json con schedule "0 12 * * *".
--
-- Anterior: 063_fix_factura_confirmar_and_producto_delete.sql
-- Siguiente: —
-- =============================================================================

create table public.seniat_reminder_subscriptions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  email         text        not null,
  rif           text        not null,
  taxpayer_type text        not null check (taxpayer_type in ('ordinario', 'especial')),
  categories    text[]      not null default '{}',
  days_before   int         not null default 3 check (days_before between 1 and 7),
  enabled       boolean     not null default true,
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz,

  unique (user_id, rif, taxpayer_type)
);

-- Índice de búsqueda por usuario (para listar subs del usuario autenticado)
create index idx_seniat_reminders_user
  on public.seniat_reminder_subscriptions (user_id);

-- Índice parcial para el cron: solo recorre filas activas
create index idx_seniat_reminders_enabled
  on public.seniat_reminder_subscriptions (enabled)
  where enabled = true;

-- RLS: habilitar siempre antes de las policies
alter table public.seniat_reminder_subscriptions enable row level security;

-- Policy: el usuario sólo puede leer y modificar sus propias suscripciones.
-- El cron usa la service_role key que bypasea RLS — no necesita policy.
create policy "seniat_reminders_owner_all"
  on public.seniat_reminder_subscriptions
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
