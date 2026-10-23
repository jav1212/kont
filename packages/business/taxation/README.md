# `@kontave/taxation`

Owns versioned product/service tax classifications, company tax-rule catalogs, Venezuelan IVA/IGTF policies, and fiscal tax decisions. Domain and application layers depend on ports; Supabase persistence is exported separately through `@kontave/taxation/supabase`.

## Product IVA resolution

`ResolveProductVenezuelanVat` and `ResolveServiceVenezuelanVat` load their company-owned classification through the corresponding product/service port, then resolve the company's versioned legal rules through `TaxationConfigurationRepository`. When no company catalog has been configured (`version === 0`), they fall back to the legacy shared tax-rule reader so historic profiles can continue to resolve. A configured catalog is authoritative; missing rules fail closed.

The result contains immutable `TaxDecision` values in base-first order. Additional luxury and payment components must be selected by rule identity by the calling business workflow. Payment IVA additionally needs the payment source and payment taxable base; the resolver does not infer payment eligibility from currency. Map the decisions to fiscal snapshots with `toFiscalTaxDeterminations` from `@kontave/taxation/fiscal`.

The server-side adapter factories `createSupabaseProductVenezuelanVatResolver` and `createSupabaseServiceVenezuelanVatResolver` compose the scoped profile and company catalog repositories using a service-role credential. Keep that credential in server composition; never pass it to a browser or native client.

Migration `supabase/migrations/321_iva_taxation_configuration.sql` adds rule categories/components, company catalogs, and their scoped RPCs. It has not been applied to the Supabase project inspected through MCP. The connected project still has only legacy IVA rules at 0% exempt and 16% taxed, and its product assignment tables do not yet expose category, slot, or price-mode columns. Therefore the new company-catalog resolver is locally testable but is not ready for a production route until migration 321 is applied and validated in an identified non-production project.

The package check and 57 unit tests cover product/service catalog selection, legacy fallback, company scope, date-effective rules, included pricing, and base/luxury/payment snapshots. `pnpm test:iva:taxation:sql` validates the additive migration contract with PGlite; it does not replace Supabase RLS, concurrency, or deployment tests.

## Product IVA assignment summary

`SummarizeProductTaxAssignments` counts a company's active products by the IVA assignment effective on a date, grouped by treatment and category. Products without an effective assignment are reported as unassigned instead of being classified, and products whose legacy catalogue type (`vat_type`) disagrees with their assignment are counted separately. The use case rejects summaries whose groups do not add up to the active products. `SupabaseProductTaxAssignmentSummaryReader` calls the STABLE RPC `shared_product_tax_assignment_summary` (migration `20261023160325_iva_company_configuration.sql`, applied in the dev environment), which authorizes with `companies.read`. Web exposes it in `GET /api/fiscal/iva/product-tax-assignments`.
