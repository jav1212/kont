// local-event-bus.ts — in-process, console-logging IEventBus implementation.
// Role: development/default adapter — logs every published event so they are observable
//       without requiring a real message broker. Replace with a real transport (e.g. Supabase
//       Realtime, Redis Streams) by swapping the factory wiring — use cases are unaffected.
// Invariant: never throws — all errors are caught and logged.
import { IEventBus }    from "@/src/core/domain/event-bus";
import { DomainEvent }  from "@/src/core/domain/domain-event";

export class LocalEventBus implements IEventBus {
    async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
        try {
            console.info(`[EventBus] ${event.eventType} | id=${event.eventId} | at=${event.occurredAt}`, event.payload);
        } catch (err) {
            console.error("[EventBus] Failed to log event:", err);
        }
    }
}
