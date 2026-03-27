# Database Docs

This folder documents the current database model used by `Kont`.

## Structure

- `public/`
  - shared SaaS schema documentation
- `tenant/`
  - per-tenant schema documentation
- `storage/`
  - Supabase Storage buckets and policies
- `migrations/`
  - migration map and evolution notes

## Current scope

The docs here are based on the current migration history in `supabase/migrations`.

They document:

- current public schema concepts
- current tenant schema concepts
- storage buckets and access rules
- high-level migration evolution

## Key files

- [public/PUBLIC_SCHEMA.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/database/public/PUBLIC_SCHEMA.md)
- [tenant/TENANT_SCHEMA.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/database/tenant/TENANT_SCHEMA.md)
- [storage/STORAGE.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/database/storage/STORAGE.md)
- [migrations/MIGRATIONS_OVERVIEW.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/database/migrations/MIGRATIONS_OVERVIEW.md)

## Notes

- This is a living documentation area.
- When new migrations are added, update the relevant file instead of adding scattered notes elsewhere.
