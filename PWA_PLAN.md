# Plan de Ataque — PWA Mobile (kont)

## Clasificación de Módulos

| Módulo | Web | Phone | Tablet | Notas |
|--------|-----|-------|--------|-------|
| **Nómina** (dashboard, empleados, historial, utilidades, prestaciones, liquidaciones, vacaciones) | ✓ | ✗ | ✗ | Web-only — flujos complejos, tablas densas |
| **Inventario** (productos, kardex, compras, ventas, movimientos, producción, departamentos, proveedores, libros, reportes, cierres) | ✓ | ✗ | ✗ | Web-only — tablas de 5–6 cols, flujos complejos |
| **Facturación / Billing** | ✓ | ✓ | ✓ | Disponible en todas las plataformas |
| **Empresas** | ✓ | ✓ | ✓ | Necesario para onboarding y cambio de empresa |
| **Auth** (sign-in, sign-up) | ✓ | ✓ | ✓ | Siempre disponible |

> **Regla:** Es la misma app y la misma URL. Los módulos web-only se ocultan en mobile/tablet mostrando una pantalla de aviso. No hay subdominios ni apps separadas.

---

## Breakpoints y Plataformas Objetivo

| Breakpoint | Rango | Dispositivos | Tratamiento |
|-----------|-------|-------------|-------------|
| **phone** | < 768px (`sm`) | iPhone SE, iPhone 14, Android compacto | Drawer, topbar, layout de 1 columna |
| **tablet** | 768px–1279px (`md` / `lg`) | iPad, iPad Air, Android tablet | Sidebar colapsable o mini-sidebar, 2 columnas |
| **desktop** | ≥ 1280px (`xl`) | MacBook, PC | Comportamiento actual — sidebar fijo `w-52` |

> **Nota de corte:** El sidebar visible permanente aparece solo en `xl:` (≥1280px). Por debajo, siempre es drawer o colapsable.

### Consideraciones iOS vs Android

| Tema | iOS (Safari) | Android (Chrome) | Acción requerida |
|------|-------------|-----------------|-----------------|
| Instalación PWA | "Agregar a pantalla de inicio" (manual, sin prompt) | Banner automático de instalación | Meta tags Apple + manifest correcto |
| Service Worker | Soportado desde iOS 16.4 en modo standalone | Soporte completo | Probar en iOS 16.4+ |
| `beforeinstallprompt` | No soportado en Safari | Soportado | No depender de este evento para iOS |
| Safe area (notch/isla) | `env(safe-area-inset-*)` necesario | Generalmente no necesario | Agregar padding con `safe-area-inset` en topbar y bottom |
| `position: sticky` | Algunos bugs en Safari con `overflow` | Estable | Evitar `overflow: hidden` en ancestros de elementos sticky |
| Scroll behavior | `-webkit-overflow-scrolling: touch` (legacy) | Nativo | No necesario en iOS 16+, pero verificar |
| Teclado virtual | Reduce el viewport → elementos fixed se desplazan | Igual | Evitar `height: 100vh` — usar `height: 100dvh` o `min-h-full` |

---

## Fases de Implementación

---

### Fase 1 — Fundamentos PWA
**Objetivo:** Hacer la app instalable en iOS Safari y Android Chrome.
**Archivos tocados:** `app/layout.tsx`, `public/`

#### Tareas

- [x] **1.1** Agregar viewport + PWA meta tags en `app/layout.tsx` via Next.js Metadata API:
  ```ts
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    viewportFit: "cover",   // necesario para safe-area en iOS (notch/isla dinámica)
  }
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ]
  ```

- [x] **1.2** Crear `public/manifest.json`:
  ```json
  {
    "name": "Kont",
    "short_name": "Kont",
    "start_url": "/",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#ffffff",
    "theme_color": "#0f0f0f",
    "lang": "es",
    "icons": [...]
  }
  ```
  - `orientation: "any"` — la app debe funcionar en portrait y landscape en tablet

- [x] **1.3** Exportar iconos de la marca en `/public/icons/`:
  - `icon-192.png` — Android Chrome (requerido)
  - `icon-512.png` — Android Chrome splash (requerido)
  - `icon-maskable-512.png` — Android adaptive icon (requerido)
  - `apple-touch-icon.png` (180×180) — iOS home screen (requerido)
  - `favicon.ico` — fallback browsers

- [x] **1.4** Agregar meta tags Apple en `app/layout.tsx` (via `<head>` o `other` en metadata):
  ```html
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Kont" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.json" />
  ```

- [x] **1.5** Reemplazar `min-h-screen` / `h-screen` por `min-h-dvh` / `h-dvh` donde aplique:
  - `dvh` (dynamic viewport height) resuelve el bug de iOS donde la barra de Safari reduce el viewport
  - Verificar en `app/(app)/layout.tsx` y `app/(public)/layout.tsx`

**Criterio de aceptación:**
- Lighthouse PWA score ≥ 80
- "Agregar a pantalla de inicio" funciona en iOS Safari 16.4+
- Banner de instalación aparece en Android Chrome
- En iPhone con isla dinámica, el contenido no queda tapado por el notch

---

### Fase 2 — Navegación Responsive (Sidebar adaptativo)
**Objetivo:** La navegación funciona correctamente en phone, tablet y desktop.
**Archivos tocados:** `src/shared/frontend/components/app-sidebar.tsx`, `app/(app)/layout.tsx`

#### Comportamiento por plataforma

| Plataforma | Sidebar | Topbar | Trigger |
|-----------|---------|--------|---------|
| **Phone** (< 768px) | Drawer oculto, desliza desde izquierda | Visible siempre (sticky) | Botón hamburguesa en topbar |
| **Tablet** (768–1279px) | Drawer oculto, desliza desde izquierda | Visible siempre (sticky) | Botón hamburguesa en topbar |
| **Desktop** (≥ 1280px) | Visible fijo `w-52` | Oculto | — |

#### Tareas

- [x] **2.1** En `app/(app)/layout.tsx`:
  - Agregar estado `sidebarOpen` (useState, default `false`)
  - Pasar `open` + `onClose` al sidebar
  - Agregar overlay semitransparente (`fixed inset-0 bg-black/50 z-40`) visible cuando drawer abierto en `< xl`
  - Overlay hace `onClose` al hacer tap

- [x] **2.2** En `app-sidebar.tsx` — layout condicional por breakpoint:
  - **Desktop** `xl:`: `xl:static xl:inset-auto xl:z-auto xl:w-52 xl:translate-x-0 xl:transition-none`
  - **Phone/Tablet** `< xl`: `fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300 ease-in-out`
    - Cerrado: `-translate-x-full`
    - Abierto: `translate-x-0`

- [x] **2.3** Crear `MobileTopBar` component (`src/shared/frontend/components/mobile-topbar.tsx`):
  - Solo visible `xl:hidden`
  - Contenido: hamburguesa + logo
  - Altura `3.5rem + env(safe-area-inset-top)` para iOS con notch/isla dinámica

- [x] **2.4** MobileTopBar vive en el flex-column del layout — no requiere `pt` manual en `<main>`

- [x] **2.5** Al navegar a una nueva ruta: cerrar el drawer automáticamente
  - `useEffect` en `app-sidebar.tsx` escucha `pathname` y llama `onClose`

**Criterio de aceptación:**
- En 375px: drawer cerrado por defecto, hamburguesa visible, drawer se abre y cierra correctamente
- En 768px (iPad portrait): mismo comportamiento que phone
- En 1024px (iPad landscape): mismo comportamiento — drawer, no sidebar fijo
- En 1280px+: sidebar fijo visible, sin topbar, sin drawer
- Al navegar entre rutas el drawer se cierra solo
- En iPhone con notch: la topbar no queda tapada

---

### Fase 3 — Gating de Módulos por Plataforma
**Objetivo:** Los módulos web-only muestran pantalla de aviso en mobile/tablet; los módulos "ambos" se renderizan normalmente.
**Archivos tocados:** `src/shared/frontend/hooks/use-is-mobile.ts` (nuevo), layouts de módulo, `app-sidebar.tsx`

#### Tareas

- [x] **3.1** Crear hook `useIsDesktop()`:
  ```ts
  // src/shared/frontend/hooks/use-is-desktop.ts
  // Usa window.matchMedia("(min-width: 1280px)") con listener de resize
  // Retorna: boolean | null (null mientras hidrata el cliente, evita flicker)
  ```

- [x] **3.2** Crear componente `DesktopOnlyGuard`:
  ```tsx
  // src/shared/frontend/components/desktop-only-guard.tsx
  // Si isDesktop === null → skeleton/spinner (evita flash de contenido incorrecto)
  // Si isDesktop === false → pantalla de aviso
  // Si isDesktop === true → renderiza children
  ```

- [x] **3.3** Envolver layouts de módulos web-only con `DesktopOnlyGuard`:
  - `app/(app)/payroll/layout.tsx`
  - `app/(app)/inventory/layout.tsx`

- [x] **3.4** En `app-sidebar.tsx`: filtrar items de navegación cuando `!isDesktop`:
  - Ocultar: Nómina, Inventario
  - Mostrar: Facturación, Empresas

- [x] **3.5** Diseñar pantalla `DesktopOnlyGuard`:
  - Icono de monitor (`MonitorIcon`)
  - Título: "Disponible solo en escritorio"
  - Descripción: "Este módulo está optimizado para pantallas grandes. Abre Kont desde tu computadora para acceder."
  - Botón secundario: "Ir a Facturación"
  - Centrado vertical y horizontal, padding generoso para touch

**Criterio de aceptación:**
- En cualquier dispositivo < 1280px: `/payroll` y `/inventory` muestran el guard
- El sidebar en mobile/tablet no muestra links de Nómina ni Inventario
- En desktop ≥ 1280px: todo funciona igual que antes, sin regresiones
- No hay flash de contenido incorrecto (el null-state muestra spinner hasta hidratar)

---

### Fase 4 — Responsividad de Módulos "Ambos"
**Objetivo:** Facturación y Empresas son completamente funcionales en phone (375px), tablet (768px) y desktop.
**Archivos tocados:** páginas y componentes de `billing` y `companies`, componentes base compartidos

#### Tareas

- [x] **4.1** Auditar y corregir `app/(app)/billing/page.tsx`:
  - Grillas: agregar `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` donde corresponda
  - Cards de plan: stack vertical en phone, horizontal en tablet+
  - Botones CTA: `w-full sm:w-auto`

- [x] **4.2** Auditar y corregir `app/(app)/companies/page.tsx`:
  - Lista de empresas: cards legibles en 375px
  - Botones de acción: mínimo 44×44px de área touch (WCAG 2.5.5)
  - Formulario de nueva empresa: inputs `w-full`, labels visibles

- [x] **4.3** Revisar componentes base compartidos:
  - `base-table`: agregar `overflow-x-auto` al wrapper si la tabla tiene más de 3 columnas
  - Modales: en phone usar `w-full h-full rounded-none` o bottom sheet — no modal centrado pequeño
  - `base-input`, `base-select`: font-size mínimo `16px` en mobile (evita zoom automático en iOS Safari)

- [x] **4.4** Ajustes globales iOS/Android:
  - Reemplazar `height: 100vh` por `height: 100dvh` en contenedores full-height
  - Asegurar `touch-action: manipulation` en botones interactivos (evita delay de 300ms en iOS)
  - Verificar que ningún `overflow: hidden` en ancestros rompe `position: sticky`

- [ ] **4.5** Testing en dispositivos reales o emuladores:
  - iPhone SE (375×667) — portrait
  - iPhone 14 Pro (393×852) — portrait y landscape
  - iPad Air (820×1180) — portrait y landscape
  - Android Pixel 7 (412×915) — portrait
  - Samsung Galaxy Tab (800×1280) — portrait

**Criterio de aceptación:**
- Billing y Empresas funcionales en 375px sin scroll horizontal
- Inputs no disparan zoom automático en iOS (font-size ≥ 16px)
- Modales no se cortan en viewports pequeños
- Touch targets ≥ 44px en todos los botones interactivos
- Sin regresiones en desktop

---

### Fase 5 — Service Worker (Offline básico)
**Objetivo:** La app carga el shell sin red. Mejora la experiencia post-instalación en iOS y Android.
**Archivos tocados:** `next.config.ts`, `app/sw.ts` (nuevo), `app/offline/page.tsx` (nuevo)

#### Consideraciones iOS

- iOS Safari soporta Service Workers **solo cuando la app está en modo standalone** (instalada en home screen) desde iOS 16.4
- En iOS Safari sin instalar: SW puede registrarse pero con limitaciones
- Cuota de cache en iOS: ~50MB — ser conservador con lo que se cachea

#### Tareas

- [x] **5.1** Instalar `@serwist/next` (compatible con Next.js 15 App Router):
  ```bash
  pnpm add @serwist/next serwist
  ```

- [x] **5.2** Configurar en `next.config.ts` y crear `app/sw.ts`

- [x] **5.3** Estrategia de cache por tipo de recurso:
  | Recurso | Estrategia | TTL |
  |---------|-----------|-----|
  | Shell (HTML/JS/CSS) | `CacheFirst` | Build hash |
  | Iconos e imágenes | `CacheFirst` | 30 días |
  | Fuentes | `CacheFirst` | 1 año |
  | `/api/*` | `NetworkFirst` | No cachear |
  | Datos de Supabase | No cachear | — |

- [x] **5.4** Crear `app/offline/page.tsx`:
  - Mensaje: "Sin conexión"
  - Botón: "Reintentar" (recarga la página)
  - Icono de wifi cortado

- [ ] **5.5** Testing iOS + Android:
  - Instalar en iOS 16.4+ via Safari → "Agregar a pantalla de inicio"
  - Instalar en Android Chrome → banner de instalación
  - Activar modo avión → verificar que el shell carga
  - Navegar a ruta con datos → verificar offline page

**Criterio de aceptación:**
- App instalable en iOS 16.4+ y Android Chrome
- Shell carga en modo avión post-instalación
- Rutas con datos muestran offline page en lugar de pantalla en blanco
- Cache no supera 30MB (conservador para iOS)

---

## Orden de Prioridad

```
Fase 1 (PWA basica)       → ~3–5h   → Instalable en iOS y Android
Fase 2 (Sidebar drawer)   → ~8–12h  → Navegable en phone y tablet
Fase 3 (Module gating)    → ~4–6h   → Experiencia mobile correcta
Fase 4 (Responsividad)    → ~8–12h  → Billing y Empresas pulidos en todos los viewports
Fase 5 (Service worker)   → ~12–20h → Nice-to-have, puede hacerse despues del MVP
```

**Total MVP (Fases 1–4): ~23–35h**
**PWA completa (Fases 1–5): ~35–55h**

---

## Decisiones de Arquitectura

1. **Una sola app, una sola URL.** Sin subdominios `m.kont.app`. El responsive design y el module gating manejan la diferencia.

2. **Breakpoint de escritorio: `xl` (1280px).** Por debajo, siempre drawer — esto cubre correctamente iPad landscape (1024px) que antes quedaba en zona gris.

3. **`useIsDesktop()` retorna `null` hasta hidratar.** Evita flash de contenido incorrecto (guard vs. módulo real) en el primer render del cliente.

4. **`height: 100dvh` en vez de `100vh`.** Resuelve el bug de iOS Safari donde la barra inferior del browser reduce el viewport dinámicamente.

5. **`viewportFit: "cover"` + `env(safe-area-inset-*)`** en topbar y bottom padding. Necesario para iPhone con notch e isla dinámica.

6. **Font-size mínimo 16px en inputs mobile.** iOS Safari hace zoom automático en inputs con font-size < 16px — esto rompe la experiencia. Aplicar via CSS o clases Tailwind `text-base`.

7. **Nómina e Inventario NO se hacen responsivos.** El guard es la solución. El ROI de hacer esos módulos responsive es muy bajo dado su complejidad.

8. **Orientation: `any` en manifest.** La app debe funcionar en portrait y landscape, especialmente en tablet donde los usuarios rotan el dispositivo.
