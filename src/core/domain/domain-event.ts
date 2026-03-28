// domain-event.ts — canonical envelope for all domain events.
// Role: core primitive — every event in the system wraps its payload in this shape.
// Invariant: eventId is a UUID, occurredAt is an ISO-8601 string, eventType follows "module.action" convention.
export interface DomainEvent<TPayload = unknown> {
    /** UUID v4 — unique identifier for this event instance. */
    readonly eventId:    string;
    /** Dot-namespaced event type, e.g. "payroll.confirmed", "employee.upserted". */
    readonly eventType:  string;
    /** ISO-8601 UTC timestamp of when the action occurred. */
    readonly occurredAt: string;
    /** Domain-specific data associated with this event. */
    readonly payload:    TPayload;
}
