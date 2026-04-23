// =============================================================================
// Infrastructure — ReminderFactory
// Monta el grafo de dependencias del módulo seniat-reminders.
//
// getReminderActions(userId)    — para rutas autenticadas (usa el server client
//                                 con anon/service key; RLS filtra por userId)
// getSystemReminderActions()    — para el cron (usa service_role key que bypasea
//                                 RLS y puede leer TODAS las subscriptions)
// =============================================================================

import { createClient }                      from "@supabase/supabase-js";
import { ServerSupabaseSource }              from "@/src/shared/backend/source/infra/server-supabase";
import { SupabaseReminderRepository }        from "./supabase-reminder.repository";
import { SubscribeReminderUseCase }          from "../application/subscribe-reminder.usecase";
import { UnsubscribeReminderUseCase }        from "../application/unsubscribe-reminder.usecase";
import { ListRemindersUseCase }              from "../application/list-reminders.usecase";
import { UpdateReminderUseCase }             from "../application/update-reminder.usecase";
import { SendPendingRemindersUseCase }       from "../application/send-pending-reminders.usecase";

/**
 * Para rutas de usuario autenticado.
 * Usa el ServerSupabaseSource (service_role key con persistSession: false).
 * RLS en la tabla garantiza que el usuario solo ve sus propias subs.
 */
export function getReminderActions() {
    const source = new ServerSupabaseSource();
    const repo   = new SupabaseReminderRepository(source.instance);

    return {
        subscribe:   new SubscribeReminderUseCase(repo),
        unsubscribe: new UnsubscribeReminderUseCase(repo),
        list:        new ListRemindersUseCase(repo),
        update:      new UpdateReminderUseCase(repo),
    };
}

/**
 * Para el cron — usa service_role key creando un cliente dedicado.
 * Bypasea RLS para poder leer TODAS las subs activas.
 */
export function getSystemReminderActions() {
    const url            = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!url || !serviceRoleKey) {
        throw new Error("Missing Supabase environment variables for system reminder actions.");
    }

    const client = createClient(url, serviceRoleKey, {
        auth: { persistSession: false },
    });

    const repo = new SupabaseReminderRepository(client);

    return {
        sendPending: new SendPendingRemindersUseCase(repo),
    };
}
