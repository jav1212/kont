# Storage

This document summarizes current Supabase Storage usage.

## Buckets

### `avatars`

Purpose:
- public avatar storage per user

Source:
- introduced in migration `044_avatars_bucket.sql`

## Access rules

### Public read

Anyone allowed by the application can read avatar objects from the `avatars` bucket.

### User-scoped write

Uploads and updates are restricted to the authenticated user's own folder:

```text
avatars/{userId}/...
```

The storage policy checks the first folder segment against `auth.uid()`.

## Related app behavior

Avatar URLs are expected to be public-facing assets.
This is intentionally different from private tenant documents, which are managed through tenant metadata and storage paths.

## Documentation note

If more buckets are introduced later, document each one here with:

- purpose
- ownership model
- read policy
- write/update/delete policy
- related app modules
