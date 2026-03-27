# Modules Catalog

This document explains what each current module does and how the platform is structured to support future commercial modules with separate plans and pricing.

## Purpose

`Kont` is no longer a single-product app.
It is evolving into a modular SaaS platform where each business module can have:

- its own scope
- its own capabilities
- its own billing plans
- its own subscription state per tenant

This document exists to make that modular business model explicit.

## Current commercial modules

At the moment, the platform has three main commercial modules:

- Payroll
- Inventory
- Documents

These are the modules that define the current commercial direction of the product.

## Platform support modules

Some areas are not commercial modules by themselves, but support the platform and tenant operations:

- Billing
- Companies
- Memberships
- Settings/Profile
- Admin platform console

These modules are critical to the product, but their role is mainly orchestration, configuration, access, and platform operations.

## Commercial model direction

The database and billing model already point toward a multi-module commercial architecture:

- `public.products` acts as a catalog of billable modules
- `public.plans` can be linked to a product
- `public.tenant_subscriptions` supports per-tenant, per-product subscriptions

That means future modules can be added without forcing the whole platform into a single shared pricing model.

## Module descriptions

### 1. Payroll

Type:
- commercial module

Goal:
- manage payroll operations for Venezuelan companies

Current functional scope:

- employee management
- payroll run creation and confirmation
- payroll history
- payroll receipts
- payroll calculations
- exports/import flows
- PDF generation for payroll documents
- statutory or operational payroll outputs

Observed user-facing areas:

- payroll dashboard
- employees
- payroll history
- liquidaciones
- prestaciones
- utilidades
- vacaciones

Key business value:

- centralizes payroll processing and employee compensation records
- supports calculation-heavy workflows
- produces output documents for payroll operations

Technical notes:

- backed by tenant tables for employees, payroll runs, and payroll receipts
- uses backend repositories and use cases
- contains significant domain-specific calculation logic in frontend utilities and backend persistence

Commercial interpretation:

- Payroll is one of the core monetizable products of the platform
- it fits naturally into a per-product subscription model

### 2. Inventory

Type:
- commercial module

Goal:
- manage stock, movements, vendors, purchase invoices, operational books, and inventory reporting

Current functional scope:

- product catalog
- departments/categories
- stock movements
- entries and exits
- adjustments
- returns
- self-consumption flows
- production/transformations
- suppliers
- purchase invoices
- period closing
- kardex
- inventory books
- purchase books
- sales/output books
- tax and balance reports

Observed user-facing areas:

- inventory dashboard
- productos
- departamentos
- movimientos
- entradas
- salidas
- ajustes
- devoluciones
- autoconsumo
- produccion
- proveedores
- cierres
- kardex
- libro-entradas
- libro-salidas
- libro-inventarios
- reporte
- reporte-islr
- reporte-saldo

Key business value:

- provides a full operational inventory workflow
- includes fiscal/reporting views beyond simple stock management
- supports purchasing and movement traceability

Technical notes:

- heavily backed by tenant RPC functions
- one of the largest domain areas in the current system
- includes multi-currency, tax, book, and reporting logic

Commercial interpretation:

- Inventory is already modeled as an independent billable product
- the migration history includes inventory-specific plans

### 3. Documents

Type:
- commercial module

Goal:
- organize and manage company documents inside the tenant workspace

Current functional scope:

- folder tree management
- document upload
- document registration
- document listing
- document deletion
- document download access
- folder replication across client tenants
- company-linked or general document organization

Observed user-facing areas:

- document browser
- folder tree
- uploads
- tenant replication workflow

Key business value:

- centralizes document storage and structure
- supports accounting or multi-client workflows through folder replication
- gives tenants a document workspace beyond payroll and inventory

Technical notes:

- uses tenant tables for folders and documents
- integrates with storage access flows
- includes cross-tenant template replication patterns for allowed use cases

Commercial interpretation:

- Documents is already treated as one of the platform’s commercial modules
- it can evolve into its own paid/free hybrid offering depending on product strategy

## Support modules

### Billing

Type:
- support/platform module

Goal:
- expose subscription, capacity, payment request, and plan information to tenants

Current scope:

- plan listing
- tenant billing state
- payment requests
- subscriptions
- module access/capacity hooks

Why it matters:

- it is the control layer that turns product modules into commercial modules

### Companies

Type:
- support/business context module

Goal:
- manage the tenant’s companies

Current scope:

- create/update/delete companies
- company lookup
- active company selection
- fiscal/contact/company branding fields

Why it matters:

- Payroll, Inventory, and Documents depend on company context

### Memberships

Type:
- support/access module

Goal:
- let users collaborate across tenants with controlled roles

Current scope:

- invitations
- membership acceptance
- member listing
- active tenant switching

Why it matters:

- it enables accountant/client or owner/team workflows
- it is a key part of multi-tenant access control

### Settings

Type:
- support/configuration module

Current scope:

- profile
- company settings
- members/settings views

Why it matters:

- centralizes tenant/user configuration

### Admin platform console

Type:
- platform operations module

Goal:
- operate the SaaS itself

Current scope:

- platform summary
- tenant management
- payment request review
- plan management
- subscription management
- admin user management

Why it matters:

- this is the internal control plane of the business

## Recommended future module model

Future modules should be introduced as first-class products, not as random pages added to the app.

Each new commercial module should define:

- business goal
- module slug
- product entry in `public.products`
- plan strategy
- subscription rules
- UI entrypoint
- backend/domain boundaries
- tenant data model

## Recommended module metadata

For each future module, document at least:

- module name
- slug
- commercial type
- problem it solves
- core entities
- company dependency
- tenant dependency
- billing model
- access rules
- reporting outputs

## Architectural recommendation

Treat commercial modules as products and support modules as platform capabilities.

That gives a cleaner model:

- products generate value and pricing
- platform capabilities enable access, billing, collaboration, and configuration

## Current summary

The current platform is best understood as:

- a modular SaaS platform
- with three commercial products today:
  - Payroll
  - Inventory
  - Documents
- and several support modules that make those products operable, configurable, and billable
