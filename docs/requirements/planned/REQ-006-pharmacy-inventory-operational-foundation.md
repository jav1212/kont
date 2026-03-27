# REQ-006 - Pharmacy Inventory Operational Foundation

## Metadata

- ID: `REQ-006`
- Name: `Pharmacy Inventory Operational Foundation`
- Status: `Planned`
- Priority: `High`
- Owner: `Product / Engineering`

## Objective

Adapt the Inventory module so it can support the operational reality of pharmacies by introducing product structure, lot handling, expiration tracking, and purchase traceability required for pharmacy inventory operations.

## Context

`Kont` already has a solid Inventory base: product catalog, providers, purchase invoices, stock movements, kardex, closures, VAT support, and multi-currency support. However, the pharmacy inventory sample confirms that the current module is still missing key operational capabilities required for pharmacy inventory management.

Observed needs from the real pharmacy inventory:

- mixed pharmacy-oriented categories such as `MEDICINA`, `MEDICINA IVA`, `MEDICINA REG`, `MEDICINA NATURAL`, `MEDICO QUIRURGICO`, and `FORMULAS INFANTILES`
- product names encoding concentration, presentation, and pharmaceutical form inside free text
- supplier relevance as part of daily operations
- last purchase and last sale visibility as important operational signals
- need for expiration-aware inventory control

Current Inventory strengths:

- product catalog
- providers
- purchase invoices
- stock movements
- kardex
- closures
- VAT support
- multi-currency support

Current Inventory gaps for pharmacy operations:

- no lot tracking
- no expiration tracking
- no FEFO-ready stock model
- no pharmacy-oriented product categorization
- no explicit product presentation fields
- no operational alerts for near-expiry or stale stock

## Scope

This requirement includes:

- pharmacy-oriented product catalog enrichment
- lot tracking
- expiration date tracking
- supplier traceability per purchase and lot context
- last purchase and last sale visibility
- operational alerts
- pharmacy-ready categorization

## Out Of Scope

This requirement does not include:

- full pharmacy regulatory compliance
- psychotropic or narcotic special-control workflows
- legal books for controlled substances
- restricted dispensing workflows
- full pharmacy point-of-sale logic
- full sales or dispensing vertical
- final FEFO automation if it materially expands the scope beyond operational readiness

## Functional Impact

The Inventory module must support a pharmacy-oriented mode where products can carry richer operational meaning and stock can be tracked beyond generic quantity and cost.

Expected outcomes:

- products can represent pharmacy catalog realities better
- stock can be tracked by lot
- lots can carry expiration dates
- the system can identify near-expiry stock
- the system can identify stale or low-rotation stock
- purchase traceability improves
- pharmacy inventory becomes operationally manageable inside the current module

## Frontend Impact

Add or adapt Inventory UI for:

- pharmacy product fields
- lot-aware purchase entry
- lot and expiration visibility in product detail and inventory views
- near-expiry alerts
- stale-stock and low-rotation indicators
- search and filtering by pharmacy-oriented attributes

Minimum UX surfaces:

- product form
- purchase invoice entry and confirmation
- product listing
- alerts and dashboard widgets
- stock detail or kardex-adjacent views

## Backend Impact

Extend Inventory domain and application logic to support:

- product attributes for pharmacy operations
- lot creation during purchases
- lot-level stock state
- expiration-aware queries
- operational alert generation
- last purchase and last sale metadata retrieval

The operational phase should stay inside the Inventory module and must not become a separate Pharmacy module yet.

## Database Impact

Likely additions:

- enriched product attributes
- product lot table or equivalent lot structure
- expiration date per lot
- stock quantity by lot
- purchase linkage per lot
- optional last purchase and last sale denormalized support if useful

Recommended conceptual additions:

- `inventory_product_profile` or equivalent product-level pharmacy attributes
- `inventory_product_lots`
- lot-linked purchase traceability
- expiration-aware reporting and query support

## Security Impact

- tenant isolation remains mandatory
- company scoping remains mandatory
- lot and purchase traceability must remain within the same tenant and company boundaries
- no privileged or regulatory-control logic should be introduced yet unless explicitly required

## Billing And Commercial Impact

This phase strengthens Inventory as a candidate for pharmacy businesses but does not yet justify advertising full pharmacy compliance.

Commercial messaging for this phase should be:

- `operationally suitable for pharmacy inventory foundations`

and not:

- `fully compliant pharmacy inventory solution`

## Key Changes

### Product Model

- add pharmacy-oriented categorization beyond the current generic product type
- add structured fields for presentation-oriented product data where needed
- do not rely entirely on product name free text for pharmacy meaning

### Lot And Expiration Model

- add lot-level inventory support tied to purchases
- each lot must support expiration date
- stock must be traceable at lot level

### Operational Visibility

- add near-expiry alerts
- add stale-stock and low-rotation indicators
- add last purchase and last sale visibility where derivable from current data

### Purchase Flow

- purchase invoice confirmation must be able to create lot-aware stock records
- traceability from supplier purchase to stock lot must be preserved

## Test Plan

### Core Scenarios

- create a pharmacy-style product with enriched classification fields
- register a purchase invoice with one or more lots and expiration dates
- confirm purchase and verify lot-level stock is created correctly
- view product stock and verify lot and expiration visibility
- verify near-expiry products appear in alerts
- verify stale or low-rotation indicators work from last-sale or last-movement data
- verify data remains isolated by tenant and company

### Regression Scenarios

- non-pharmacy inventory flows continue to work
- existing generic products remain compatible
- current purchase invoice flow still works for non-lot products if backward compatibility is required
- kardex and movement views remain functionally correct after lot-aware extension

## Assumptions

- this phase is intentionally operational, not regulatory
- sales and dispensing workflow is deferred
- controlled substances and regulated medicine controls are deferred to the later vertical phase
- the Inventory module remains the host module for this work and no separate Pharmacy module is created yet
- FEFO can be prepared structurally now, even if full automation is deferred to the next phase
