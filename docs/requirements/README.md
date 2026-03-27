# Requirements Docs

This folder is used to plan, track, and document new requirements in a structured way.

## Purpose

Each requirement should move through a clear lifecycle:

- backlog
- planned
- in progress
- done

This keeps future work organized and reduces ambiguity before implementation starts.

## Structure

- `backlog/`
  - raw or early-stage requirements
- `planned/`
  - refined requirements with attack plans
- `in-progress/`
  - requirements currently being implemented
- `done/`
  - completed requirements with final documentation
- `templates/`
  - templates for creating new requirement docs

## Recommended workflow

1. Create a draft in `backlog/`
2. Refine it into a full implementation plan in `planned/`
3. Move it to `in-progress/` when execution starts
4. Move it to `done/` once completed and documented

## Naming convention

Use names like:

```text
REQ-001-short-name.md
REQ-002-short-name.md
```

Examples:

- `REQ-001-new-commercial-module.md`
- `REQ-002-role-permissions-matrix.md`
- `REQ-003-inventory-audit-log.md`

## Template

Use:

- [templates/REQUIREMENT_TEMPLATE.md](/Users/haldrimmolina/Documents/GitHub/kont/docs/requirements/templates/REQUIREMENT_TEMPLATE.md)
