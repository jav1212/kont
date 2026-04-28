// =============================================================================
// Domain — ReminderSubscription
// Modelo e interfaz de repositorio para las suscripciones a recordatorios
// de obligaciones tributarias SENIAT.
// =============================================================================

import type { ObligationCategory, TaxpayerType } from "@/src/modules/tools/seniat-calendar/data/types";

export interface ReminderSubscription {
    id:           string;
    userId:       string;
    email:        string;
    rif:          string;
    taxpayerType: TaxpayerType;
    categories:   ObligationCategory[];
    daysBefore:   number;      // 1-7, defaults to 3
    enabled:      boolean;
    createdAt:    string;      // ISO
    lastSentAt:   string | null; // ISO or null
}

export interface ReminderSubscriptionRepository {
    /**
     * Crea una nueva suscripción.
     * Lanza error si ya existe un unique (userId, rif, taxpayerType).
     */
    create(data: Omit<ReminderSubscription, "id" | "createdAt" | "lastSentAt">): Promise<ReminderSubscription>;

    /** Busca todas las suscripciones de un usuario */
    findByUserId(userId: string): Promise<ReminderSubscription[]>;

    /** Busca por id (cualquier usuario — el caller debe verificar ownership) */
    findById(id: string): Promise<ReminderSubscription | null>;

    /** Actualiza campos parciales de una suscripción (enabled, categories, daysBefore) */
    update(id: string, patch: Partial<Pick<ReminderSubscription, "enabled" | "categories" | "daysBefore" | "email">>): Promise<ReminderSubscription>;

    /** Elimina una suscripción por id */
    delete(id: string): Promise<void>;

    /**
     * Devuelve todas las suscripciones activas (enabled = true).
     * Llamada por el cron — requiere service role que bypasea RLS.
     */
    findEnabled(): Promise<ReminderSubscription[]>;

    /** Actualiza lastSentAt al timestamp indicado */
    updateLastSent(id: string, sentAt: string): Promise<void>;

    /**
     * Devuelve el nombre y email del dueño de la suscripción para que el cron
     * pueda firmar los emails con el contador correcto. Requiere service_role
     * (auth.admin). null si el usuario fue borrado.
     */
    findUserMeta(userId: string): Promise<{ name: string | null; email: string } | null>;
}
