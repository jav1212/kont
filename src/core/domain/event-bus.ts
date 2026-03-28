// event-bus.ts — port (interface) for publishing domain events.
// Role: core abstraction — use cases depend on this interface, not on any concrete transport.
// Invariant: implementations must be fire-and-forget safe — publish() should not throw.
//            If delivery fails, implementations must handle it internally (log, retry, etc.).
import { DomainEvent } from "./domain-event";

export interface IEventBus {
    publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
}
