# `@kontave/preferences`

Portable user appearance, regional, and view-layout preferences shared by application clients.

## Per-view visibility (ADM-043/044)

`GetEffectiveUserViewPreferences` returns unpersisted defaults with every field and column visible. `UpdateUserViewPreferences` saves bounded lists of hidden optional field IDs and column IDs using optimistic revisions. `SupabaseUserViewPreferencesRepository` reads through owner-scoped RLS and writes through `update_user_view_preferences`, which derives the user from `auth.uid()`.

Each consuming capability owns its registered `viewId` and the field/column catalog. It must intersect persisted hidden IDs with that catalog and keep required, authorization, safety, and workflow fields visible; this package stores presentation choices and does not grant or remove business permissions. View IDs and item IDs are stable lowercase identifiers, duplicates are rejected, each hidden list is capped at 100 entries, and each user is capped at 100 layouts.

The additive migration `307_user_view_preferences.sql` creates isolated storage and a revision-checked RPC. It does not alter the existing appearance/regional row or business data. The Web, Desktop, and Mobile presentation layers have not consumed this contract yet.

## Per-user process defaults (ADM-045)

`GetEffectiveUserProcessDefaults` returns an empty, unpersisted map until a user
saves defaults. `UpdateUserProcessDefaults` replaces the sparse map using an
expected revision. Keys are stable input IDs; values are limited to JSON
primitives, with a maximum of 100. The consuming process must intersect IDs
with its own input catalog and validate values using its business rules. Maps
are also limited to 64 KiB. These preferences never authorize actions or
override server-side validation.

## Typed parameters per user and process (ADM-042)

`GetEffectiveUserProcessParameters` and `UpdateUserProcessParameters` resolve a
capability-owned catalog of boolean, bounded number, bounded text, and finite
choice parameters. The catalog supplies stable IDs, canonical defaults, and a
`customizable` policy for each value. Reads do not persist defaults; updates
replace sparse overrides with an expected revision. Unknown or locked IDs,
invalid catalogs, mismatched types, control characters, and out-of-range values
are rejected before persistence. Retired or newly locked stored IDs fall back
to the current catalog without changing business data.

Values use the existing `user_process_defaults` table and update RPC under
`process.parameters.<processId>`, separate from ADM-045's general input defaults.
No schema migration is required. A consuming process must still register its
real parameter catalog and enforce operational rules independently: this
preference cannot authorize an action or change legal calculations.

## Per-user menu names (ADM-047)

`GetEffectiveUserNavigationLabels` and `UpdateUserNavigationLabels` store sparse
overrides for stable IDs in `@kontave/navigation`. Unknown destination IDs,
empty/control-character labels, and labels longer than 60 characters are
rejected. Empty overrides use the canonical labels from the navigation
catalog. The preference key is `navigation.menu` and uses the existing
per-user process-default table and revision checks. Client presentations still
need to load and apply the overrides; custom labels never change routes or
access policy.

## Per-user field names (ADM-048)

`GetEffectiveUserFieldLabels` and `UpdateUserFieldLabels` persist sparse labels
under a stable view ID and field ID. Labels are limited to 60 characters and
100 entries per view, with revision checks. The form or table owner must
intersect returned IDs with its own field catalog and keep required, security,
workflow, and regulatory labels intact. Renaming a field changes presentation
only; it never changes the field's storage key, validation, or permission.

## Per-user navigation icons (ADM-050)

`GetEffectiveUserNavigationIcons` and `UpdateUserNavigationIcons` persist sparse
icon choices under stable navigation destination IDs and optimistic revisions.
The choices use the portable semantic keys in `@kontave/navigation`, rather
than icon names from a platform library. Each client maps supported semantic
keys to its own visual icon set and falls back to its canonical icon when no
override exists. Invalid destinations and unknown icon keys are rejected.
The preference key is `navigation.icons` in the existing process-default
storage; no schema change is required. Clients have not yet loaded these
preferences into their navigation views.

## Per-user help copy (ADM-051)

`GetEffectiveUserHelpTexts` and `UpdateUserHelpTexts` resolve registered help
topics against canonical copy and persist sparse, user-scoped overrides under
`help.texts` with optimistic revisions. The owning capability supplies stable
topic IDs, defaults, and whether each topic may be customized. Custom copy is
plain text, limited to 2,000 characters per topic; unknown or locked topics,
control characters, and invalid catalogs are rejected. Empty overrides restore
canonical copy. Required, fiscal, security, and workflow guidance should be
registered as non-customizable by its owning capability. This reuses the
existing process-default schema and RPC; no database migration is needed.

There is no canonical help-topic catalog or UI integration yet. The current
contract is user-scoped; organization-wide help administration needs product
scope confirmation before adding shared persistence.

## Per-user system labels (ADM-052)

`GetEffectiveUserSystemLabels` and `UpdateUserSystemLabels` resolve stable IDs
registered by a consuming module and persist sparse overrides under
`system.labels` with optimistic revisions. IDs use a `system.` namespace to
keep these labels separate from navigation names and form-field names. Labels
are plain text limited to 60 characters. A consumer can mark required,
regulatory, security, or workflow labels as non-customizable; stale overrides
for such labels fall back to canonical copy. This uses existing process-default
storage and does not change business identifiers, routes, or validation.

When a product exposes more than one independent label catalog, callers may
provide a stable `catalogId`; the package stores it under
`system.labels.<catalogId>`. This prevents one module's replacement from
clearing another module's overrides. Omitting `catalogId` preserves the original
`system.labels` key for existing consumers. Catalog IDs are validated and
bounded to the process-key constraints; this extension needs no schema change.

Web currently registers labels for inventory products, the payroll employee
directory, and purchasing suppliers. The contract is user-scoped, so shared
organization/company administration remains a product decision; other module
catalogs and clients must register their own canonical labels before exposing
overrides.
