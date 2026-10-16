# @kontave/audit-trail

Capacidad portable para AUD-001 a AUD-022: pistas inmutables de creación, modificación, eliminación y anulación. Cada hecho incluye actor, instante, sucursal, equipo y el límite tenant/organización/empresa. El catálogo cubre facturas, órdenes de pago, clientes, productos, trabajadores, recibos de nómina y comprobantes contables.

La API ofrece registro, consulta paginada, diffs antes/después y metadata de creación/última modificación. `ExecuteAuditedMutation` declara el puerto `AtomicAuditedMutationPort`: el adaptador de producción abre una transacción, obtiene snapshots, inserta la pista y confirma la mutación como una sola unidad. Si falla cualquiera de esos pasos, debe revertirlos todos.

Migration 292 creates the append-only `public.shared_operational_audit_trail`, installs triggers on the seven available operational entity families, and exposes a service-role query RPC gated by `audit.read`. Migration 295 adds the payment-order table and attaches the same trigger for that eighth family. `SupabaseAuditTrailRepository` decodes the query boundary. The audit trigger runs in the write transaction, so a rollback leaves no trail record. Actor, branch and device are nullable to preserve legacy writes that cannot establish operation context.

The migrations are not applied remotely and do not instrument new commands automatically. The payment-order module provides versioned CRUD and reads under `payment_orders.*` permissions, records administrative payment intent, and does not execute a transfer. `InMemoryAuditTrailRepository` remains a test double, not a production transaction implementation.
