# @kontave/ui-dom

`Breadcrumbs` renders an ordered, semantic navigation trail. Each item has a stable `id`, visible `label`, optional `current` state, and optional real `href`. Supply `linkComponent` to render the href with the host router while keeping the package independent of Next.js. When no link component is supplied, `onNavigate` remains available for existing consumers.

The current item is rendered as text with `aria-current="page"`; separators are hidden from assistive technology. The accessible landmark label defaults to “Ruta de navegación”.
