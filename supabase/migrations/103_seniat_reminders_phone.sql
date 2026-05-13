-- =============================================================================
-- 103_seniat_reminders_phone.sql
-- Agrega canal WhatsApp a las suscripciones SENIAT.
--
-- Cambios:
--   1. Email pasa a ser opcional (ya no es el único canal).
--   2. Se agrega columna `phone` (E.164) opcional.
--   3. CHECK que garantiza al menos un canal por suscripción.
--   4. CHECK de formato E.164 cuando phone viene presente.
--
-- Compatibilidad:
--   Las suscripciones existentes mantienen su email intacto y phone = NULL,
--   por lo que el cron las sigue procesando solo por correo.
--
-- Anterior:  102_bono_guerra_history.sql
-- Siguiente: —
-- =============================================================================

alter table public.seniat_reminder_subscriptions
  alter column email drop not null;

alter table public.seniat_reminder_subscriptions
  add column phone text;

alter table public.seniat_reminder_subscriptions
  add constraint seniat_reminders_at_least_one_channel
  check (email is not null or phone is not null);

alter table public.seniat_reminder_subscriptions
  add constraint seniat_reminders_phone_e164
  check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
