// =============================================================================
// Infrastructure — SupabaseReminderRepository
// Implementa ReminderSubscriptionRepository sobre public.seniat_reminder_subscriptions.
//
// Nota: esta tabla usa el schema PUBLIC, no el schema por-tenant.
// Usa directamente el SupabaseClient pasado en el constructor.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReminderSubscription, ReminderSubscriptionRepository } from "../domain/reminder-subscription";
import type { ObligationCategory, TaxpayerType } from "@/src/modules/tools/seniat-calendar/data/types";

// ── Row shape from the DB ──────────────────────────────────────────────────────

interface DbRow {
    id:            string;
    user_id:       string;
    email:         string;
    rif:           string;
    taxpayer_type: string;
    categories:    string[];
    days_before:   number;
    enabled:       boolean;
    created_at:    string;
    last_sent_at:  string | null;
}

function toModel(row: DbRow): ReminderSubscription {
    return {
        id:           row.id,
        userId:       row.user_id,
        email:        row.email,
        rif:          row.rif,
        taxpayerType: row.taxpayer_type as TaxpayerType,
        categories:   (row.categories ?? []) as ObligationCategory[],
        daysBefore:   row.days_before,
        enabled:      row.enabled,
        createdAt:    row.created_at,
        lastSentAt:   row.last_sent_at ?? null,
    };
}

const TABLE = "seniat_reminder_subscriptions";

export class SupabaseReminderRepository implements ReminderSubscriptionRepository {
    constructor(private readonly client: SupabaseClient) {}

    async create(
        data: Omit<ReminderSubscription, "id" | "createdAt" | "lastSentAt">
    ): Promise<ReminderSubscription> {
        const { data: row, error } = await this.client
            .from(TABLE)
            .insert({
                user_id:       data.userId,
                email:         data.email,
                rif:           data.rif,
                taxpayer_type: data.taxpayerType,
                categories:    data.categories,
                days_before:   data.daysBefore,
                enabled:       data.enabled,
            })
            .select()
            .single();

        if (error) throw new Error(error.message);
        return toModel(row as DbRow);
    }

    async findByUserId(userId: string): Promise<ReminderSubscription[]> {
        const { data, error } = await this.client
            .from(TABLE)
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);
        return (data as DbRow[]).map(toModel);
    }

    async findById(id: string): Promise<ReminderSubscription | null> {
        const { data, error } = await this.client
            .from(TABLE)
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) return null;
        return toModel(data as DbRow);
    }

    async update(
        id: string,
        patch: Partial<Pick<ReminderSubscription, "enabled" | "categories" | "daysBefore" | "email">>
    ): Promise<ReminderSubscription> {
        const dbPatch: Record<string, unknown> = {};
        if (patch.enabled   !== undefined) dbPatch.enabled     = patch.enabled;
        if (patch.categories !== undefined) dbPatch.categories  = patch.categories;
        if (patch.daysBefore !== undefined) dbPatch.days_before = patch.daysBefore;
        if (patch.email      !== undefined) dbPatch.email       = patch.email;

        const { data, error } = await this.client
            .from(TABLE)
            .update(dbPatch)
            .eq("id", id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return toModel(data as DbRow);
    }

    async delete(id: string): Promise<void> {
        const { error } = await this.client
            .from(TABLE)
            .delete()
            .eq("id", id);

        if (error) throw new Error(error.message);
    }

    async findEnabled(): Promise<ReminderSubscription[]> {
        const { data, error } = await this.client
            .from(TABLE)
            .select("*")
            .eq("enabled", true)
            .order("created_at", { ascending: true });

        if (error) throw new Error(error.message);
        return (data as DbRow[]).map(toModel);
    }

    async updateLastSent(id: string, sentAt: string): Promise<void> {
        const { error } = await this.client
            .from(TABLE)
            .update({ last_sent_at: sentAt })
            .eq("id", id);

        if (error) throw new Error(error.message);
    }
}
