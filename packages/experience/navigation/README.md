# @kontave/navigation

Portable navigation catalog and pure route resolution shared by Web, Desktop, and Mobile.

`NavigationNode.webPath` is an optional Web-only path pattern. Static segments match literally; `:parameter` and `[parameter]` segments are extracted for dynamic destinations. `resolveNavigationTargetFromPath(pathname)` selects the longest matching catalog path, prefers the deepest destination when paths are equal, and returns a typed target or `undefined` when no catalog path matches. This resolver does not change `resolveBreadcrumbs`, which remains the platform-independent hierarchy resolver.

```ts
const target = resolveNavigationTargetFromPath("/payroll/employees/123");
const trail = target ? resolveBreadcrumbs(target, labels) : [];
```
