# `@kontave/purchasing`

Business workflows for supplier orders, receipts, returns, and invoice matching. Domain and application code stays independent of Supabase; the adapter exposes the persistence boundary from `./supabase`.

## Supplier invoice matching

`SaveSupplierInvoiceMatchDraft` accepts a draft that links every line of a received fiscal invoice to purchase-order or receipt evidence. It checks that allocated quantities and net amounts reconcile exactly to each saved fiscal line, and verifies the supplier and document belong to the authorized company.

`ConfirmSupplierInvoiceMatch` rechecks the scoped draft, received invoice, supplier identity, currency, quantities, and amounts. It maps the immutable fiscal tax snapshots into a purchase fact; incomplete classification or credit evidence remains marked for review. The application requires a `SupplierInvoiceMatchCommitPort` so the match and fact succeed or fail together.

For server composition, `createSupabaseSupplierInvoiceMatchActions` binds the scoped supplier and fiscal readers, match repository, and application commands to one server-authorized Supabase client. Confirmation calls `shared_supplier_invoice_match_confirm_with_tax_fact` once. The RPC checks organization membership or active purchasing delegation, validates the company and source invoice, compares the expected match version, records the fact and match snapshot, and stores an idempotency record in the same database transaction.

Migration `supabase/migrations/336_supplier_invoice_match_tax_fact.sql` adds the persistence and RPC contract. It depends on the fiscal document schema and `shared_tax_reporting_facts` from migration 322. Migrations 322 and 336 are applied to the single Supabase project connected for this repository. The Web purchase-confirmation route still uses its legacy flow; connect the match adapter only after the received fiscal-document capture and review flow is composed, then verify isolation, concurrency, and rollback with controlled records in the connected project.

## Purchase branch consolidation

[`GetPurchaseBranchConsolidation`](./src/application/branch-consolidation.ts) reads confirmed purchase invoices by accessible branch, document type, and document currency. Its rows expose only exact functional amounts in VES; the transaction currency identifies the source document and does not change the currency of those totals. The coverage object keeps confirmed invoices without `branchId` visible as a separate count, without assigning historical documents to a branch.

[`SupabasePurchaseBranchConsolidationReader`](./src/adapters/supabase/purchase-branch-consolidation.ts) is server-only and calls the protected `get_native_purchase_branch_consolidation` RPC. The corresponding database contract is [`350_purchase_branch_consolidation.sql`](../../../supabase/migrations/350_purchase_branch_consolidation.sql): it keeps `branch_id` nullable for existing invoices, validates branch/company/tenant scope through a composite foreign key, and exposes branch-aware confirmation and reporting only to `service_role`. Callers must supply the authenticated actor and scoped organization/company; the RPC rechecks purchasing and branch permissions.

[`ConfirmPurchaseInvoiceForBranch`](./src/application/branch-invoice-confirmation.ts) validates the same scope and explicit branch UUID before delegating to its confirmation port. [`SupabasePurchaseInvoiceBranchConfirmationPort`](./src/adapters/supabase/purchase-branch-invoice-confirmation.ts) invokes `confirm_native_purchase_invoice_branch_secure`, so assigning the branch and confirming the draft happen under the protected database transaction.

This capability does not infer branch ownership for historic invoices, is not a Web integration, and does not attribute inventory movements or payroll. Consumers should render the unattributed coverage separately from branch totals.
