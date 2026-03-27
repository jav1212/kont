# Requirement

## Metadata

- ID: REQ-003
- Name: Mobile Invoice OCR for Inventory
- Status: Planned
- Priority: High
- Owner: Product / Engineering

## Objective

Enable the mobile PWA experience of the Inventory module to capture supplier invoices, extract structured information from them, let the user review and edit the extracted data, and then register the confirmed result into the Inventory purchase flow.

## Context

One of the most time-consuming operational problems in Inventory is the manual transcription of purchase invoices.

Current pain points:

- users transcribe invoice data line by line
- users manually retype supplier information
- users manually enter product details, quantities, and amounts
- large invoice volumes create major operational friction
- manual entry increases the risk of mistakes

The goal of this requirement is to reduce manual work in the mobile flow by adding:

- capture
- OCR/text extraction
- structured parsing
- confirmation
- registration into Inventory

## Scope

This requirement includes the design and phased implementation plan for:

- mobile PWA invoice capture
- image or document upload from mobile devices
- OCR/text extraction
- invoice parsing into structured fields
- editable review UI
- manual confirmation before persistence
- registration into Inventory after confirmation

## Out of scope

The MVP should not try to solve all document automation use cases.

The first version should not include:

- blind automatic posting without user review
- support for every possible fiscal document type
- full offline OCR processing
- perfect provider-template-specific extraction for all vendors
- full AI product normalization across every supplier format
- automatic accounting posting

These can be added later if the base workflow succeeds.

## Functional impact

The Inventory mobile flow will gain a new capability:

- capture or upload an invoice
- extract relevant invoice information
- show a review draft
- allow corrections
- confirm and register the invoice into Inventory

Target user outcome:

- instead of retyping every field manually, the user validates and corrects a prefilled draft

## Frontend impact

This requirement affects the mobile PWA experience of Inventory.

Likely UI areas:

- mobile camera capture flow
- upload flow for image or PDF
- OCR processing state
- extracted data review screen
- product lines editor
- confirmation action
- error and retry states

Minimum UI capabilities:

- capture using device camera
- upload from file picker
- preview original document
- show extracted invoice header fields
- show extracted invoice lines
- allow editing before confirmation
- allow cancel or retry

Recommended review fields:

- supplier name
- supplier RIF
- invoice number
- control number
- invoice date
- currency
- subtotal
- VAT amount
- total
- line items

## Backend impact

The backend will need a controlled ingestion flow for OCR-based invoice drafts.

Likely responsibilities:

- receive uploaded invoice source
- trigger OCR/extraction
- normalize extracted payload
- persist draft or temporary processing result
- validate required fields
- convert confirmed payload into Inventory purchase data

Recommended backend boundaries:

- capture/upload endpoint
- OCR processing service or adapter
- invoice parsing/normalization service
- confirmation endpoint
- Inventory integration endpoint/service

Important rule:

OCR output must never be treated as trusted final data.
Confirmation by the user is required before registration into Inventory.

## Database impact

This feature will likely need one or more temporary or persistent structures for:

- uploaded invoice source reference
- OCR draft result
- extraction status
- parsed supplier data
- parsed line items
- user confirmation state
- link to final inventory purchase record

Possible design directions:

- temporary OCR draft table
- draft purchase invoice structure
- document link to original captured file

The final confirmed output should map into the existing Inventory purchase invoice flow rather than creating a disconnected new process.

## Security impact

Security impact is medium to high because invoice images and extracted purchase data are sensitive business records.

Main requirements:

- tenant isolation must be preserved
- captured files must remain private to the tenant
- OCR drafts must not leak across tenants
- only authorized users should capture, review, and confirm invoices
- source files must be treated as business evidence

Recommended rule:

- keep the original invoice file linked to the resulting inventory record whenever possible

## Billing/commercial impact

This feature increases the operational value of the Inventory module.

Commercially, it can become:

- a premium capability inside Inventory plans
- a usage-based enhancement later
- a differentiator for mobile field workflows

This does not necessarily require a separate commercial module.
It should be treated first as a high-value Inventory capability.

## Verified MVP definition

The MVP should support:

- supplier purchase invoices
- mobile capture from camera
- image or PDF upload
- OCR extraction
- extraction of invoice header fields
- extraction of product lines
- editable review screen
- user confirmation
- creation of a confirmed Inventory purchase invoice draft or record

Recommended MVP behavior:

- the user captures or uploads a document
- the system extracts fields and line items
- the user reviews and edits the result
- the user confirms
- the system creates the Inventory purchase invoice record

## Recommended extracted fields

### Invoice header

- supplier name
- supplier RIF
- invoice number
- control number
- date
- currency
- subtotal
- VAT amount
- total

### Invoice lines

- product description
- quantity
- unit cost
- line total
- tax rate if available

## Recommended confirmation behavior

Before registration, the user must be able to:

- review extracted values
- edit wrong values
- remove bad lines
- add missing lines
- confirm or cancel

This review step is mandatory for MVP.

## Risks

### 1. OCR quality variability

Invoice formats, photo quality, lighting, and print quality may produce inconsistent extraction results.

### 2. Product line parsing complexity

Extracting totals is easier than correctly extracting product rows line by line.

### 3. Supplier format variability

Different supplier layouts may require normalization logic that evolves over time.

### 4. False trust in automation

If users assume extraction is always correct, inventory data quality may degrade.

### 5. Storage and evidence handling

If the original invoice image is not preserved properly, audit and review quality will suffer.

## Attack plan

### Phase 1 - Workflow and UX definition

- objective:
  define the mobile OCR workflow, required fields, and review/confirmation experience
- affected areas:
  product definition, mobile UX, inventory flow design
- risk level:
  low to medium
- success criteria:
  the team agrees on the exact MVP workflow and field set

### Phase 2 - Capture and OCR ingestion

- objective:
  implement mobile capture/upload and OCR draft generation
- affected areas:
  PWA mobile frontend, upload flow, OCR backend adapter, storage
- risk level:
  medium
- success criteria:
  a mobile user can capture or upload an invoice and receive an extracted draft result

### Phase 3 - Review and confirmation flow

- objective:
  implement editable review and manual confirmation
- affected areas:
  mobile review UI, draft editing flow, validation logic
- risk level:
  medium
- success criteria:
  users can safely review and correct extracted data before final registration

### Phase 4 - Inventory registration integration

- objective:
  convert confirmed OCR drafts into Inventory purchase invoice records
- affected areas:
  inventory backend, purchase invoice flow, file linkage, status handling
- risk level:
  high
- success criteria:
  confirmed OCR results create valid Inventory purchase invoice records without bypassing existing business rules

### Phase 5 - Accuracy improvement and expansion

- objective:
  improve extraction quality and support more document patterns
- affected areas:
  parsing logic, supplier normalization, matching rules, analytics
- risk level:
  medium
- success criteria:
  extraction quality improves over time without changing the core workflow

## Acceptance criteria

- a mobile PWA user can capture or upload an invoice
- the system can extract meaningful structured invoice data
- the user can review and edit extracted data
- confirmation is required before registration
- the confirmed result can enter the Inventory purchase flow
- the original invoice source remains linked or preserved as business evidence
- tenant isolation and data privacy are preserved

## Notes

This requirement should be implemented as a controlled assistive workflow, not as fully autonomous invoice posting.

The first success metric should be:

- significant reduction in manual typing time

The second success metric should be:

- acceptable extraction accuracy after user review
