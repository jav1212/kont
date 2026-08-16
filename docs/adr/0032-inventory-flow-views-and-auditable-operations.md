# ADR 0032: Inventory flow views and auditable operations

## Decision

Entradas and Salidas are directional read models over posted inventory effects. Operaciones owns manual inventory drafts and their post/reverse lifecycle. Purchasing and Sales continue owning their source documents.

The portable inventory model uses `shared_inventory_operations` and `shared_inventory_operation_lines`. Existing `shared_inventory_movements` remain the stock ledger and are exposed as migrated posted facts. Published facts are reversed, never physically deleted.

Product classifiers use the canonical term `ProductCategory`; “Departamentos” remains only a compatibility navigation alias.

## Consequences

- Quantities are aggregated per unit and incompatible units are never summed.
- Manual native creation is initially limited to opening balances, stock-count adjustments, and self-consumption.
- Purchase receipts, sales issues, customer/supplier returns, and production effects must ultimately be initiated by their owning capability.
- Desktop, Mobile, and Web can share DTOs and application ports without sharing UI code.
