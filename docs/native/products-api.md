# Native Products API v1

The Products screen is a composed read model. `products` owns catalog identity and categories; `inventory` owns on-hand quantity, replenishment, valuation, and movements. Clients must not edit stock or cost through product commands.

## Routes

- `GET|POST /api/native/v1/organizations/{organizationId}/companies/{companyId}/products`
- `GET|PATCH /api/native/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}`
- `POST /api/native/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}/activate`
- `POST /api/native/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}/deactivate`
- `GET /api/native/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}/movements`
- `PATCH /api/native/v1/organizations/{organizationId}/companies/{companyId}/products/{productId}/inventory-profile`
- `GET|POST /api/native/v1/organizations/{organizationId}/companies/{companyId}/product-categories`
- `PATCH /api/native/v1/organizations/{organizationId}/companies/{companyId}/product-categories/{categoryId}`
- `POST /api/native/v1/organizations/{organizationId}/companies/{companyId}/product-categories/{categoryId}/activate`
- `POST /api/native/v1/organizations/{organizationId}/companies/{companyId}/product-categories/{categoryId}/deactivate`

All successful responses use `{ data, meta: { requestId } }`. All expected failures use `{ error: { code, message, requestId } }`.

## List behavior

Supported query fields are `search`, `status`, `categoryId`, `stock`, `sort`, `direction`, `cursor`, and `limit`. The default limit is 25 and the maximum is 100. Cursors are opaque: clients persist and return them without decoding them.

`summary` describes the complete company catalog, not only the returned page. Monetary valuation is functional VES inventory cost. Presentation conversions based on workspace BCV context belong in the client and must not replace the authoritative VES amount.

Physical quantities always include their canonical unit and must never be added across incompatible units. Canonical unit values are `each`, `kilogram`, `gram`, `meter`, `square_meter`, `cubic_meter`, `liter`, `gallon`, `box`, `roll`, and `package`.

## Writes and concurrency

Product creation has no version. Product updates and lifecycle commands require the product `expectedVersion`. Category updates and lifecycle commands require the category `expectedVersion`. Replenishment updates require the inventory profile `expectedVersion`; this is intentionally independent from the product version.

Stock and cost cannot be provided when creating or updating a product. Initial stock, adjustments, purchases, sales, and corrections must be recorded as auditable inventory operations.

Products and categories are deactivated, not physically deleted. Existing Web rows are retained and translated by the Supabase adapter. A category is the portable name for the legacy inventory department classifier; it is not an organizational department or warehouse location.

## Current capability flags

Product detail returns:

```json
{
  "capabilities": {
    "inventoryEnabled": true,
    "locationTracking": false,
    "lotTracking": false
  }
}
```

Desktop must use these flags and must not fabricate locations or lots. Location and lot support will be additive after their shared persistence and operational flows exist.

## Authorization

- List, detail, categories, and movements: `inventory.read`.
- Create product or category: `inventory.create`.
- Edit, activate, deactivate, and replenishment policy: `inventory.update`.
- Delegated access must contain the `inventory` scope.
- The company must be operational and have the `inventory.products` module capability active.

Native clients use the shared authenticated client so centralized session refresh and the single retry policy continue to apply.
