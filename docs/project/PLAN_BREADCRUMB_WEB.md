# Plan: breadcrumb Web con estándares profesionales

Estado: implementación completada; QA manual pendiente · Fecha: 2026-10-27 · Alcance: `src/shared/frontend/components/app-breadcrumb.tsx`, `@kontave/navigation`, `@kontave/ui` (`packages/ui/dom`)

## 0. Estándares de referencia

### 0.1 Accesibilidad (WAI-ARIA APG Breadcrumb + WCAG 2.2 AA)

- `<nav aria-label>` con lista ordenada `<ol>`; un único nombre accesible en todo el producto.
- El último elemento tiene `aria-current="page"` y no es enlace.
- Separadores decorativos (`aria-hidden` o CSS).
- Contraste de texto ≥ 4.5:1 (1.4.3); foco visible en cada enlace (2.4.7 / 2.4.11).
- Área de clic ≥ 24×24 px (2.5.8).

### 0.2 Usabilidad (NN/g, GOV.UK, Carbon, Atlassian)

- Refleja la jerarquía del sitio, no el historial del navegador.
- Es navegación secundaria: no reemplaza al sidebar.
- No se muestra si solo hay un nivel.
- Etiquetas idénticas a las del menú y al título de la página; nada de "Página" o "Detalle".
- Las rutas de detalle muestran el nombre real de la entidad.
- En móvil se colapsa sin perder la posibilidad de subir de nivel.
- Truncado con el texto completo disponible (`title`/tooltip).
- Íconos con moderación.

### 0.3 Ingeniería

- Una sola fuente de verdad para la jerarquía (regla DRY de `AGENTS.md`): Web, Desktop y Mobile resuelven contra el mismo catálogo.
- Resolución en una función pura con pruebas; el componente solo dibuja.
- Preferencias de usuario (etiquetas e íconos) cargadas una vez, compartidas y sin parpadeo.
- Enlaces `<a href>` reales (clic central, abrir en pestaña nueva).
- Tipado estricto: sin `!`, keys estables, TSDoc en API pública.

## 1. Diagnóstico del breadcrumb actual

| # | Problema | Ubicación |
|---|---|---|
| 1 | La jerarquía se deduce comparando strings de la URL contra `APP_MODULES`/`MODULE_SUBNAV`, mientras Desktop/Mobile usan `resolveBreadcrumbs`. Pueden divergir. | `app-breadcrumb.tsx:19-57` |
| 2 | Breadcrumb y sidebar piden cada uno `navigation-labels` y `navigation-icons`: 4 peticiones por página. | `app-breadcrumb.tsx:69-89`, `app-sidebar.tsx:139-155` |
| 3 | Parpadeo: primero se ven las etiquetas por defecto y después las personalizadas. | mismo |
| 4 | Por debajo de `sm` solo se ve el último elemento; no hay forma de subir un nivel. | `app-breadcrumb.tsx:99` |
| 5 | Fallbacks genéricos "Página"/"Detalle"; con rutas desconocidas se muestra un breadcrumb de un solo elemento. | `app-breadcrumb.tsx:26, 43-47` |
| 6 | Truncado sin texto completo; los enlaces intermedios con `shrink-0` pueden desbordar. | `app-breadcrumb.tsx:103-105` |
| 7 | Sin foco visible y con área de clic pequeña (texto de 12 px sin padding). | `app-breadcrumb.tsx:103` |
| 8 | Nombre accesible inconsistente: "Migas de pan" (Web) frente a "Ruta de navegación" (`packages/ui/dom`). | `app-breadcrumb.tsx:93`, `packages/ui/dom/src/breadcrumbs.tsx:21` |
| 9 | Uso de `matchedModule!`, keys `label-index` y una lógica de índices de íconos frágil. | `app-breadcrumb.tsx:28, 48-55, 99` |
| 10 | Sin pruebas: la Web raíz no tiene suite de tests. | — |

## 2. Decisiones

| Decisión | Elección | Motivo |
|---|---|---|
| Íconos | Solo el ícono del módulo, en el segundo nivel. "Inicio" va como texto. | Respeta la personalización que ya usan los usuarios, ancla visualmente el breadcrumb con el sidebar y elimina la lógica de índices frágil. Los íconos de los subniveles son ruido. |
| Mapeo ruta→destino | En `@kontave/navigation`, como dato del catálogo (`webPath`) más una función pura. | Hoy la jerarquía está repetida en `APP_MODULES`, `MODULE_SUBNAV` y los aliases de `navigationDestinationFor`. Es un cambio aditivo y con pruebas, compatible con la congelación de la Web. |
| Patrón móvil | Enlace "← Padre". | En móvil la necesidad es subir un nivel; el sidebar cubre los saltos. Ocupa una línea, no requiere menú y es un patrón conocido (GOV.UK, iOS). |
| Colapso en escritorio | Con más de 4 niveles: primero / "…" / últimos 2. | Hoy casi ninguna ruta lo necesita; es una mejora de prioridad baja. |

## 3. Fases

Restricción: congelación de la Web de producción (`AGENTS.md`). Los cambios son incrementales, no mueven rutas y los contratos de los paquetes solo crecen.

### Fase 0 — Línea base

- Script en `scripts/` que recorra todas las rutas de `APP_MODULES` y `MODULE_SUBNAV`, más ejemplos de rutas de detalle, y guarde el trail actual (labels + hrefs) como snapshot JSON.
- **Aceptación:** el snapshot está versionado y cubre todos los módulos.

### Fase 1 — Una sola fuente de verdad

- `packages/experience/navigation`:
  - Añadir `webPath` (opcional, aditivo) a cada destino de `NAVIGATION_DESTINATIONS`.
  - Añadir `resolveNavigationTargetFromPath(pathname): NavigationTarget | undefined`, pura, con coincidencia por el prefijo más largo y soporte de parámetros dinámicos.
  - Pruebas en `test/navigation.test.ts` con los casos del snapshot de la Fase 0.
- Web:
  - `getBreadcrumbItems` delega en `resolveNavigationTargetFromPath` y `resolveBreadcrumbs(target, labels)`.
  - Eliminar los aliases de `navigationDestinationFor` cuando ya no tengan consumidores.
- **Responsable:** `backend_engineer` (paquete) y luego `web_engineer` (consumo).
- **Aceptación:** el snapshot de la Fase 0 no cambia, salvo las diferencias que se documenten como intencionales.

### Fase 2 — Preferencias de navegación compartidas

- `NavigationPreferencesProvider` en el layout `(app)`: un solo fetch de etiquetas e íconos; escucha `kontave:navigation-labels-updated` y `kontave:navigation-icons-updated`.
- Hook `useNavigationPreferences()`, consumido por `AppSidebar` y `AppBreadcrumb`.
- Opcional: valores iniciales precargados desde el servidor para eliminar el parpadeo.
- **Aceptación:** 2 peticiones por carga (antes 4); al guardar en ajustes, sidebar y breadcrumb se actualizan.

### Fase 3 — Componente de presentación y accesibilidad

- Extender `Breadcrumbs` de `packages/ui/dom` con `href` por elemento y una prop `linkComponent` para inyectar `next/link` sin depender de Next.js en el paquete.
- La Web pasa a usar ese componente; `AppBreadcrumb` queda como composición (resolver + preferencias + render).
- Reglas:
  - No se renderiza con menos de 2 niveles.
  - Móvil (`< sm`): enlace "← {padre}".
  - Escritorio con más de 4 niveles: primero / "…" (menú) / últimos 2.
  - Truncado con `max-w` y `title` con el texto completo.
  - Anillo de foco visible, padding para un área de 24 px y tokens con contraste AA.
  - `aria-label` unificado: "Ruta de navegación".
  - Keys por id de destino.
  - Ícono solo en el nivel del módulo.
- **Aceptación:** navegación completa con teclado; NVDA anuncia el landmark y la página actual; ningún desbordamiento horizontal a 320 px.

### Fase 4 — Rutas de detalle

- Inventariar las páginas dinámicas (`[id]`) y comprobar que pasan `title` a `PageHeader` con el nombre real de la entidad (empleado, factura, proveedor…).
- Sustituir los fallbacks genéricos por la etiqueta del destino padre más un identificador legible.
- **Aceptación:** ninguna ruta muestra "Página" ni "Detalle".

### Fase 5 — Validación

- `pnpm lint`, `pnpm build` y los tests de `@kontave/navigation`.
- Comparar con el snapshot de la Fase 0.
- Revisión manual: teclado, NVDA y anchos de 320/768/1280 px.
- Comprobar que Desktop y Mobile siguen funcionando (`resolveBreadcrumbs` sin cambios incompatibles).

## 4. Ejecución

- **Fases 0–4 implementadas.** El script `scripts/navigation-breadcrumb-snapshot.ts` cubre las rutas de `APP_MODULES` y `MODULE_SUBNAV`, más casos de detalle; el artefacto versionado `PLAN_BREADCRUMB_WEB.snapshot.json` contiene 110 rutas con el trail previo y el resuelto por catálogo.
- `@kontave/navigation` registra rutas estáticas y dinámicas. El resolvedor exige coincidencia de todos los segmentos, prioriza el prefijo más largo y desempata por la jerarquía más profunda.
- `NavigationPreferencesProvider` centraliza las dos peticiones y los eventos de actualización para sidebar y breadcrumb.
- `Breadcrumbs` (`@kontave/ui`) admite enlaces reales y el breadcrumb Web usa ese componente. En móvil presenta el enlace al padre; escritorio usa destinos estables, foco visible, etiquetas completas y una lista desplegable para niveles colapsados.
- `PageHeader` permite dar al breadcrumb el nombre o identificador real del registro sin cambiar el título visual. Las páginas dinámicas de facturas y el estado de portales usan ese contexto.
- Documentación actualizada en `packages/experience/navigation/README.md` y `packages/ui/dom/README.md`.
- **Validación:** tests de `@kontave/navigation` (10/10), checks de `@kontave/navigation` y `@kontave/ui`, ESLint focal y `git diff --check` pasan. El build compila Webpack y luego falla en el chequeo TypeScript por `presentation-registry.ts`, que no registra `taxWithholding`. El `tsc` raíz reporta el mismo error. `pnpm lint` se detiene por `packages/experience/feedback/src/application/index.ts:375` (`no-empty-object-type`). Son fallos preexistentes fuera del alcance de este plan. La revisión manual con teclado/NVDA y anchos 320/768/1280 px queda pendiente.

## 5. Entregas

| PR | Fases | Naturaleza |
|---|---|---|
| 1 | 0, 1, 2 | Deuda estructural: fuente única, peticiones duplicadas, parpadeo. Sin cambios visuales. |
| 2 | 3, 4 | Cambio visual y de accesibilidad. |

La documentación final del paquete y del componente ya está actualizada en sus README correspondientes.


\n