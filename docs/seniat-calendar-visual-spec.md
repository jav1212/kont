# Spec visual — Calendario Tributario SENIAT
**Ruta:** `/herramientas/calendario-seniat`
**Fecha:** 2026-04-23
**Autor:** UI/UX Senior — Konta Design System

---

## 1. Auditoría breve del design system heredado

El design system de Konta tiene una base sólida: escala neutral azul-pizarra, tokens semánticos WCAG AA verificados, tipografía mono como voz principal (Geist Mono), y el patrón hero de `tools-shell.tsx` como estándar de tools públicos. Ese patrón — `rounded-2xl border border-border-light bg-surface-1` como contenedor raíz, stagger de framer-motion a 0.08s/paso, strip de controles en `bg-surface-2 border-t border-border-light` — se hereda sin cambios.

Decisiones nuevas para este tool:

- **Paleta de categorías tributarias**: los cuatro badge semánticos existentes (success/warning/error/info) no son suficientes para 8 categorías. Se introducen alias específicos por categoría que mapean sobre tokens existentes, sin añadir variables CSS nuevas.
- **Énfasis en el tiempo**: este tool es esencialmente un calendario de urgencia. El componente `CountdownBanner` y la variante "next" de `ObligationCard` usan `--primary-500` (naranja Konta) como señal de proximidad crítica — coherente con el lenguaje de marca.
- **CalendarGrid como protagonista**: a diferencia del tool de divisas (datos tabulares), aquí el grid espacial de 12 meses es la acción principal. Ocupa el cuerpo completo con más aire vertical que otros tools.

---

## 2. Identidad del tool

**Nombre visual:** Calendario Tributario SENIAT

**Subtítulo / tagline:**
`Consulta tus fechas de declaración y pago de impuestos en Venezuela. Gratis, sin registro.`

**Badge de autoridad legal** (inline en el hero, junto al nombre):
```
className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-border-light
           bg-surface-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary"
```
Texto: `Providencia SNAT/2025/0049 · SENIAT`

**Icono principal:** `CalendarDays` de lucide-react (stroke-width 1.5, size 20 en hero, 16 en breadcrumbs/tabs).

**Señal de estado activo en el badge hero:**
```
<span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
```
Texto al lado: `Año fiscal 2025 · Actualizado`

---

## 3. Paleta semántica por categoría de obligación

Cada categoría mapea sobre tokens CSS existentes. Ningún token nuevo en `:root`. Las clases `badge-*` del design system se extienden con variantes de composición directa.

| Categoría | Token texto | Token bg | Token border | Icono Lucide | Ratio AA |
|---|---|---|---|---|---|
| `IVA` | `--text-info` | `--badge-info-bg` | `--badge-info-border` | `Receipt` | 6.77:1 L / 4.97:1 D |
| `ISLR_RETENCIONES` | `--text-warning` | `--badge-warning-bg` | `--badge-warning-border` | `ArrowDownLeft` | 7.48:1 L / 8.1:1 D |
| `ISLR_ANUAL` | `--text-error` | `--badge-error-bg` | `--badge-error-border` | `FileText` | 5.93:1 L / 5.2:1 D |
| `ISLR_ESTIMADA` | `--text-error` | `--badge-error-bg` | `--badge-error-border` | `TrendingUp` | 5.93:1 L / 5.2:1 D |
| `IGTF` | `--text-secondary` | `--surface-2` | `--border-light` | `Banknote` | 8.35:1 L / 5.8:1 D |
| `LOCTI` | `--text-success` | `--badge-success-bg` | `--badge-success-border` | `FlaskConical` | 5.59:1 L / 6.6:1 D |
| `RETENCIONES_ISLR_TERCEROS` | `--text-warning` | `--badge-warning-bg` | `--badge-warning-border` | `Users` | 7.48:1 L / 8.1:1 D |
| `OTROS` | `--text-tertiary` | `--surface-3` | `--border-light` | `MoreHorizontal` | 5.62:1 L / 4.5:1 D |

**Nota ISLR_ANUAL vs ISLR_ESTIMADA:** Comparten el mismo color semántico (error/rojo) pero se diferencian exclusivamente por el icono. Esta es una decisión deliberada: ambas son obligaciones de alta criticidad fiscal, y la diferenciación por icono es suficiente en contexto de lista o card. Si el equipo necesita separarlos visualmente en el futuro, `ISLR_ESTIMADA` puede moverse a `--text-warning`.

**Clase utilitaria sugerida por categoría** (ejemplo para IVA):
```
className="inline-flex items-center gap-1 h-5 px-2 rounded-md border text-[10px] font-mono
           uppercase tracking-[0.14em] border-badge-info-border bg-badge-info-bg text-text-info"
```

---

## 4. Tipografía jerárquica del tool

El sistema de fuentes no cambia: `Darker Grotesque` (sans) para headings y botones, `Geist Mono` (mono) para body, números, fechas, etiquetas técnicas. Este tool es de naturaleza técnica-fiscal, por lo que el peso de mono es mayor que en otros contexts.

| Rol | Familia | Tamaño | Peso | Line-height | Tracking | Tailwind |
|---|---|---|---|---|---|---|
| H1 Hero | mono | `text-[28px] sm:text-[34px]` | `font-bold` | `leading-[1.05]` | `tracking-[-0.02em]` | `font-mono font-bold tracking-tight` |
| H2 Sección | mono | `text-[20px] sm:text-[22px]` | `font-bold` | `leading-tight` | `tracking-[-0.01em]` | — |
| Label uppercase chips | mono | `text-[10px]` | `font-medium` | — | `tracking-[0.18em]` | `font-mono uppercase tracking-widest` |
| Fecha en cards (numérica) | mono | `text-[22px] sm:text-[28px]` | `font-bold` | `leading-none` | `tracking-[-0.02em]` | `font-mono tabular-nums` |
| Contador countdown | mono | `text-[15px] sm:text-[18px]` | `font-bold` | `leading-none` | `tracking-[-0.01em]` | `font-mono tabular-nums font-bold` |
| Descripción / body | mono | `text-[13px] sm:text-[14px]` | `font-normal` (500 heredado de body) | `leading-relaxed` | default | `font-mono` |
| Nombre obligación en card | sans | `text-[13px] sm:text-[14px]` | `font-semibold` | `leading-snug` | default | `font-sans` |

**Nota importante:** `font-feature-settings: "tnum" 1` ya está aplicado globalmente a `.font-mono` en `globals.css`. No se necesita repetir en componentes individuales. Para contadores y fechas agregar `tabular-nums` como clase Tailwind es suficiente para refuerzo semántico.

---

## 5. Componentes clave — spec individual

### Hero

Hereda directamente el patrón de `PublicHero` en `tools-shell.tsx`:

```
className="relative rounded-2xl overflow-hidden border border-border-light bg-surface-1"
```

**Layout interno:** `grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start md:items-center px-5 sm:px-8 py-6 sm:py-8`

**Columna izquierda:** badge de autoridad legal + H1 + tagline (igual que tools-shell)

**Columna derecha (stat-card de próxima obligación):**
- `min-w-[240px] rounded-xl border border-primary-500 bg-surface-1 px-5 py-4`
- Muestra: etiqueta `Próximo vencimiento`, nombre de la obligación, fecha grande en mono, days-to en badge de severidad
- En estado empty (sin RIF): muestra skeleton placeholder con `animate-pulse bg-surface-2`

**Strip de controles (parte inferior del hero):**
- `border-t border-border-light bg-surface-2 px-5 sm:px-8 py-3 flex items-center justify-between gap-3 flex-wrap`
- Izquierda: `RifInput` + `TaxpayerTypeToggle` + `YearSelector`
- Derecha: `ViewToggle` + `ExportActions`

---

### RifInput

Extiende `BaseInput.Field` con máscara de formato venezolano.

**Máscara:** `J-XXXXXXXX-X` | `V-XXXXXXXX` | `E-XXXXXXXX` | `G-XXXXXXXX` | `P-XXXXXXXX`

**Ancho:** `min-w-[200px] max-w-[260px]`

**Estados:**

| Estado | Border | Ring | Icono end |
|---|---|---|---|
| Empty | `border-border-light` | ninguno | `Building2` en `text-text-disabled` |
| Valid | `border-success/60` + `ring-2 ring-success/10` | 2px success/10 | `CheckCircle2` en `text-text-success` |
| Invalid | `border-error/60` + `ring-2 ring-error/10` | 2px error/10 | `ErrorIcon` existente en `BaseInput` |

Helper text en estado invalid: `"RIF inválido. Formato esperado: J-12345678-9"` en `text-[11px] font-mono text-text-error/80`

**Placeholder:** `J-12345678-9` en `text-neutral-400`

---

### CompanySelector

HeroUI `Select` estándar. Solo visible cuando el RIF ingresado devuelve múltiples empresas (edge case).

```
className="min-w-[200px] rounded-lg border border-border-light bg-surface-1 font-mono text-[13px]"
```

**Item de lista:** avatar de letra (primera letra del nombre) en `w-6 h-6 rounded-md bg-primary-100 text-primary-600 text-[10px] font-mono font-bold flex items-center justify-center` + nombre empresa + RIF en `text-text-tertiary`.

**Estado loading (fetching empresas):** skeleton de `Select` con `animate-pulse bg-surface-2 rounded-lg h-10 w-[200px]`.

---

### TaxpayerTypeToggle

Dos cards descriptor lado a lado con un switch implícito. No es HeroUI Switch — es un segmented-toggle custom.

**Contenedor:** `flex gap-2 items-center`

**Cada card-opción:**
```
className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer
           transition-colors duration-150 select-none"
```

- **Inactiva:** `border-border-light bg-surface-1 text-text-tertiary hover:border-border-medium hover:bg-surface-2`
- **Activa:** `border-primary-500 bg-primary-50 text-text-primary dark:bg-primary-50/10 dark:border-primary-500`
- **Icono:** `User` (persona natural) / `Building2` (jurídica) — size 14, stroke 1.5
- **Label:** `text-[11px] font-mono uppercase tracking-[0.14em]`
- **Min-width:** `min-w-[100px]`
- **focus-visible:** `ring-2 ring-primary-500/30 ring-offset-1`

---

### YearSelector

Tabs pill-style horizontales.

**Contenedor:** `flex gap-1 p-1 rounded-lg bg-surface-2 border border-border-light`

**Cada pill:**
```
className="px-3 py-1 rounded-md text-[11px] font-mono font-medium uppercase tracking-[0.1em]
           transition-colors duration-150 cursor-pointer"
```
- **Inactiva:** `text-text-tertiary hover:text-text-secondary hover:bg-surface-1`
- **Activa:** `bg-surface-1 text-text-primary shadow-sm border border-border-light`

Mostrar máximo 3 años (año actual − 1, actual, actual + 1). El año actual es el default.

---

### CountdownBanner

Banner sticky que aparece cuando hay una obligación con vencimiento inminente. Se posiciona debajo del hero, antes del contenido principal.

**Severidades:**

| Días restantes | Background | Border | Texto | Icono | Pulse |
|---|---|---|---|---|---|
| ≤ 3 días | `bg-badge-error-bg` | `border-badge-error-border` | `text-text-error` | `AlertTriangle` | `animate-pulse` en el icono |
| ≤ 7 días | `bg-badge-warning-bg` | `border-badge-warning-border` | `text-text-warning` | `Clock` | ninguno |
| > 7 días | `bg-surface-2` | `border-border-light` | `text-text-secondary` | `Calendar` | ninguno |

**Estructura:**
```
className="rounded-xl border px-4 py-3 flex items-center gap-3"
```
- Icono (16px) + texto principal en `text-[13px] font-mono` + días en `font-bold tabular-nums` + botón ghost "Ver detalles" a la derecha

**aria-live:** `role="status" aria-live="polite" aria-label="Próximo vencimiento tributario"`

**Animación pulse (≤ 3 días):**
```css
.pulse-ring {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```
Solo anima el icono, nunca el banner completo (respeta `prefers-reduced-motion`).

---

### FilterChips

Multi-select de categorías tributarias. Scroll horizontal en mobile.

**Contenedor:** `flex gap-2 overflow-x-auto pb-1 scrollbar-none`

**Cada chip:**
```
className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border whitespace-nowrap
           cursor-pointer transition-colors duration-150 text-[11px] font-mono
           uppercase tracking-[0.12em] flex-shrink-0"
```
- **Inactivo:** `border-border-light bg-surface-1 text-text-tertiary hover:border-border-medium hover:bg-surface-2`
- **Activo:** usa las clases del token de la categoría (por ejemplo para IVA: `border-badge-info-border bg-badge-info-bg text-text-info`)
- **focus-visible:** `ring-2 ring-primary-500/30 ring-offset-1`
- **Chip "Todos":** activo por defecto, usa `border-primary-500 bg-primary-50 text-text-link dark:bg-primary-50/10`

**Indicador de scroll (mobile):** gradiente `bg-gradient-to-r from-transparent to-background` en el extremo derecho del contenedor, `pointer-events-none`.

---

### ViewToggle

Segmented control de 2 opciones: "Mensual" / "Lista".

```
className="flex gap-0 p-0.5 rounded-lg bg-surface-2 border border-border-light"
```

**Cada opción:**
```
className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono
           uppercase tracking-[0.1em] transition-colors duration-150 cursor-pointer"
```
- **Inactiva:** `text-text-tertiary hover:text-text-secondary`
- **Activa:** `bg-surface-1 text-text-primary shadow-sm border border-border-light`

Iconos: `LayoutGrid` (Mensual) + `List` (Lista) — size 12.

---

### CalendarGrid

El componente más complejo del tool. Muestra 12 meses como grid.

**Contenedor responsive:**
```
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
```

**Mes-card:**
```
className="rounded-xl border border-border-light bg-surface-1 overflow-hidden
           cursor-pointer transition-all duration-200
           hover:border-border-medium hover:shadow-md"
```
- Expandido (click): `border-primary-500` + `shadow-lg`
- **Header del mes-card:** `flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-border-light`
  - Izquierda: nombre del mes en `text-[13px] font-sans font-semibold text-text-primary uppercase tracking-[0.06em]`
  - Derecha: badge con número de obligaciones `inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-600 text-[10px] font-mono font-bold dark:bg-primary-50/10 dark:text-primary-500`

**Mini-bars por día con obligación** (body del mes-card):
```
className="px-4 py-3 flex flex-col gap-1.5"
```
Cada barra: `flex items-center gap-2`
- Fecha: `text-[10px] font-mono tabular-nums text-text-tertiary w-8 flex-shrink-0`
- Bar: `flex-1 h-1.5 rounded-full` con color de la categoría más crítica del día (prioridad: error > warning > info > success > neutral)
- N obligaciones: `text-[10px] font-mono text-text-disabled ml-1`

**Panel expandido** (click en mes-card): lista de `ObligationCard` dentro del card. Animación: height expand con `framer-motion` `AnimatePresence` + `initial={{ height: 0, opacity: 0 }}` → `animate={{ height: "auto", opacity: 1 }}`.

**Mobile (< 640):** los 12 meses colapsan a `BaseAccordion`, un mes por ítem. Header del accordion = nombre mes + badge conteo.

---

### ObligationsList

Vista alternativa (cuando ViewToggle está en "Lista"). Lista cronológica de todas las obligaciones del año.

**Sticky month headers:**
```
className="sticky top-0 z-10 py-2 px-0 mb-2 bg-background border-b border-border-light"
```
Texto: `text-[11px] font-mono uppercase tracking-[0.18em] text-text-tertiary`

**Gap entre grupos:** `mb-6`

---

### ObligationCard

La unidad reutilizable en CalendarGrid y ObligationsList.

**Variante "upcoming" (default):**
```
className="rounded-xl border border-border-light bg-surface-1 px-4 py-3
           flex items-start gap-4 transition-all duration-200
           hover:border-border-medium hover:shadow-md hover:-translate-y-px"
```

**Variante "past" (fecha pasada):**
```
className="rounded-xl border border-border-light bg-surface-2 px-4 py-3
           flex items-start gap-4 opacity-55"
```
Sin hover lift. Texto en `text-text-disabled`.

**Variante "next" (la próxima obligación, destacada):**
```
className="rounded-xl border border-primary-500 bg-primary-50 px-4 py-3
           flex items-start gap-4 shadow-sm
           dark:bg-primary-50/8 dark:border-primary-500"
```

**Estructura interna:**

```
<!-- Fecha (columna izquierda) -->
<div className="flex flex-col items-center w-12 flex-shrink-0 text-center">
  <span className="text-[22px] font-mono font-bold tabular-nums leading-none text-text-primary">
    {DD}
  </span>
  <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
    {MMM}
  </span>
</div>

<!-- Divider vertical -->
<div className="w-px self-stretch bg-border-light flex-shrink-0" />

<!-- Contenido (columna derecha) -->
<div className="flex flex-col gap-1.5 min-w-0 flex-1">
  <div className="flex items-center justify-between gap-2">
    <!-- Badge categoría -->
    <span className="... badge por categoría ...">
      <Icon size={10} /> {LABEL}
    </span>
    <!-- Days-to -->
    <span className="text-[10px] font-mono tabular-nums text-text-tertiary">
      {N} días
    </span>
  </div>
  <p className="text-[13px] font-sans font-semibold text-text-primary leading-snug truncate">
    {titulo_obligacion}
  </p>
  <p className="text-[11px] font-mono text-text-tertiary leading-snug line-clamp-2">
    {descripcion}
  </p>
</div>
```

**Min-height:** `min-h-[80px]`

---

### ExportActions

Dropdown con 4 acciones de exportación.

**Trigger:** `BaseButton.Root variant="secondary" size="sm"` con `rightIcon={<ChevronDown size={12} />}` y `leftIcon={<Download size={12} />}`. Texto: `Exportar`.

**Menú (HeroUI Dropdown):**
```
className="rounded-xl border border-border-light bg-surface-1 shadow-lg p-1 min-w-[180px]"
```

Items:
| Acción | Icono | Descripción |
|---|---|---|
| PNG | `Image` | Captura de pantalla del calendario |
| PDF | `FileText` | Resumen anual en PDF |
| ICS / iCal | `CalendarPlus` | Importar a Google Calendar / Apple Calendar |
| Copiar enlace | `Link2` | URL con año y RIF precompletados |

**Item style:**
```
className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-mono
           text-text-secondary cursor-pointer transition-colors duration-150
           hover:bg-surface-2 hover:text-text-primary"
```

**aria-label en trigger:** `aria-label="Exportar calendario tributario"`

**Nota PNG/PDF:** fuerzan `light mode` en la captura/renderizado, independiente del tema activo del usuario.

---

### ReminderOptIn

Modal (HeroUI Modal) que requiere autenticación.

**Trigger:** `BaseButton.Root variant="ghost" size="sm"` con `leftIcon={<Bell size={12} />}`. Texto: `Activar recordatorios`.

**Modal container:**
```
className="rounded-2xl border border-border-light bg-surface-1 shadow-xl max-w-[440px] w-full p-6"
```

**Contenido:**
- Icono `BellRing` en `w-10 h-10 rounded-xl bg-primary-50 text-primary-500 flex items-center justify-center dark:bg-primary-50/10`
- H2: `text-[18px] font-sans font-bold text-text-primary`
- Body: `text-[13px] font-mono text-text-secondary leading-relaxed`
- CTA primario: `BaseButton.Root variant="primary" fullWidth` → "Crear cuenta gratis"
- CTA secundario: `BaseButton.Root variant="ghost" fullWidth` → "Ya tengo cuenta"
- Disclaimer pequeño: `text-[11px] font-mono text-text-tertiary text-center`

---

### Disclaimer

Footer legal al final del tool, estilo sutil.

```
className="mt-10 pt-6 border-t border-border-light"
```

Texto en `text-[11px] font-mono text-text-disabled leading-relaxed max-w-[680px]`. Incluir número de providencia, nota de que las fechas son referenciales y que se debe verificar en el portal SENIAT, y enlace externo `text-text-link hover:text-text-link-hover underline` a `www.seniat.gob.ve`.

---

### FaqSeniat

Usa `BaseAccordion` existente, mismo patrón que `PublicFaq` en tools-shell.

**Contenedor:**
```
className="mt-10 pt-8 border-t border-border-light flex flex-col gap-5"
```

**Eyebrow:** `text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary`
**H2:** `text-[20px] sm:text-[22px] font-mono font-bold tracking-[-0.01em] text-text-primary`
**Accordion wrapper:** `rounded-2xl border border-border-light bg-surface-1 p-2`

Preguntas sugeridas (5):
1. ¿Quiénes están obligados a declarar IVA mensualmente?
2. ¿Qué es la retención de ISLR a terceros?
3. ¿Cómo se calcula la cuota de ISLR estimada?
4. ¿El IGTF aplica a todas las empresas?
5. ¿Dónde presento mis declaraciones?

---

### EmbedBadge

Solo visible en la ruta `/herramientas/calendario-seniat/embed`. Posición fija abajo-derecha.

```
className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 h-8 px-3
           rounded-full border border-border-light bg-surface-1 shadow-md
           text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary
           hover:text-text-secondary hover:border-border-medium transition-colors duration-150"
```
Icono: logo Konta (svg, 14px) + "Powered by Konta". Enlace a `https://kontave.com`.

---

## 6. Motion calibration

### Stagger de secciones

Copia exacta del patrón de `tools-shell.tsx`:

```ts
const STAGGER_STEP = 0.08;
const section = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay: i * STAGGER_STEP, ease: "easeOut" as const },
});
```

Orden de índices recomendado:
- `0` → Hero
- `1` → CountdownBanner (si aplica)
- `2` → FilterChips + ViewToggle strip
- `3` → CalendarGrid / ObligationsList
- `4` → ExportActions strip
- `5` → FaqSeniat
- `6` → Disclaimer

### Transición grid ↔ lista

`AnimatePresence mode="wait"`. Salida: `{ opacity: 0, x: -6, transition: { duration: 0.15 } }`. Entrada: `{ initial: { opacity: 0, x: 6 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.22, ease: "easeOut" } }`.

### Hover en ObligationCard (variante "upcoming")

```css
transition: transform 150ms cubic-bezier(0.25, 1, 0.5, 1),
            box-shadow 150ms cubic-bezier(0.25, 1, 0.5, 1),
            border-color 150ms;
```
Transform: `translateY(-1px)`. Shadow delta: de `--shadow-sm` a `--shadow-md`. Animar solo `transform` y `box-shadow` — nunca `width`, `height`, `padding`.

### Pulse en CountdownBanner (≤ 3 días)

```css
@keyframes icon-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.animate-icon-pulse {
  animation: icon-pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

Solo aplica al icono (`AlertTriangle`). No anima el banner completo.

**Reducción de movimiento:**
```css
@media (prefers-reduced-motion: reduce) {
  .animate-icon-pulse,
  .animate-pulse {
    animation: none;
  }
}
```

### Toast Sonner

```ts
toast.success("Enlace copiado", {
  position: "bottom-right",
  duration: 3000,
  style: {
    background: "var(--surface-1)",
    border: "1px solid var(--border-light)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
  },
});
```

Para errores: `toast.error(...)` con `border-color: var(--badge-error-border)`.

---

## 7. Responsive breakpoints

### Mobile (< 640px)

- Hero: columna única, stat-card de próxima obligación debajo del texto principal
- RifInput ocupa 100% del ancho disponible
- TaxpayerTypeToggle: los dos cards apilados en fila (flex-row con gap-1.5, cada card flex-1)
- YearSelector: pills con scroll horizontal si hay 3+ años (`overflow-x-auto`)
- FilterChips: scroll horizontal, gradiente fade en el borde derecho
- ViewToggle: visible, misma posición
- CalendarGrid: accordion `BaseAccordion` de 12 ítems (un mes por ítem)
- ExportActions: oculto en strip superior; accesible mediante FAB o al final del contenido (`fixed bottom-20 right-4`)
- ReminderOptIn: modal a pantalla completa (`modal-placement="bottom"` en HeroUI, `rounded-t-2xl rounded-b-none`)

### Tablet (640px–1024px)

- Hero: dos columnas (`grid-cols-[1fr_auto]`) cuando el viewport lo permite
- CalendarGrid: `grid-cols-2`
- ExportActions: botones stackeados en columna dentro del dropdown (mismo componente, sin cambio)
- Strip de controles del hero: puede requerir `flex-wrap`

### Desktop (> 1024px)

- CalendarGrid: `grid-cols-3`
- Strip de controles del hero: fila horizontal sin wrap
- ExportActions: visible como botón con dropdown (no FAB)
- ObligationsList: puede tener sidebar de filtros en futuras versiones (reservar espacio `grid-cols-[240px_1fr]`)

---

## 8. Dark mode

Todos los tokens semánticos usados en esta spec tienen su contraparte dark declarada en `.dark` de `globals.css`. No se añade ningún token nuevo. Verificación por token crítico:

| Token | Light | Dark | Verificado |
|---|---|---|---|
| `--text-info` | `#2563EB` (6.77:1) | `#60A5FA` (4.97:1) | AA |
| `--text-warning` | `#92400E` (7.48:1) | `#FCD34D` (8.1:1) | AA/AAA |
| `--text-error` | `#B91C1C` (5.93:1) | `#F87171` (5.2:1) | AA |
| `--text-success` | `#047857` (5.59:1) | `#34D399` (6.6:1) | AA |
| `--text-primary` | `#111525` (16.5:1) | `#E8ECF8` (12.5:1) | AAA |
| `--text-secondary` | `#464D66` (8.35:1) | `#A8AEBF` (5.8:1) | AA |
| `--text-tertiary` | `#5F6780` (5.62:1) | `#8A93A6` (4.5:1) | AA |

**Excepción**: la exportación PNG/PDF fuerza light mode. Antes de generar el canvas para la captura, aplicar clase `light` al contenedor del CalendarGrid independiente del tema activo:

```ts
// En la función de export:
calendarRef.current.classList.add("force-light");
// ... generar PNG ...
calendarRef.current.classList.remove("force-light");
```

La clase `.force-light` debe sobrescribir las variables de dark en el subtree del CalendarGrid.

---

## 9. Accesibilidad

### Contrastes WCAG verificados (ver tabla en sección 8)

Todos los pares texto/fondo en badges de categoría pasan AA mínimo (4.5:1 texto normal, 3:1 UI). El más ajustado es `OTROS` en dark: `--text-tertiary` sobre `--surface-3` → verificar al implementar que el contraste no baje de 4.5:1 en esa combinación específica.

### Tab order explícito del shell

1. Skip-to-content link (`#main-content`) — visualmente oculto, visible en focus
2. Navegación principal (si aplica en layout público)
3. `RifInput`
4. `TaxpayerTypeToggle` (primera opción → segunda opción)
5. `YearSelector` (pills izquierda a derecha, Arrow keys para navegar entre pills)
6. `FilterChips` (chips izquierda a derecha, Arrow keys entre chips del mismo grupo)
7. `ViewToggle` (2 opciones con Arrow keys)
8. `ExportActions` trigger → items del dropdown con Arrow keys
9. `CountdownBanner` (si visible) — no focusable como elemento, pero el botón "Ver detalles" sí
10. Cards del CalendarGrid (Enter/Space para expandir)
11. Links de navegación del FAQ

### aria-labels críticos

```html
<!-- RifInput -->
<input aria-label="RIF de la empresa a consultar" aria-describedby="rif-helper" />

<!-- CountdownBanner -->
<div role="status" aria-live="polite"
     aria-label="Próxima obligación tributaria: [nombre], vence en [N] días" />

<!-- ExportActions trigger -->
<button aria-label="Exportar calendario tributario" aria-haspopup="menu" aria-expanded="false" />

<!-- ViewToggle -->
<div role="tablist" aria-label="Vista del calendario">
  <button role="tab" aria-selected="true" aria-controls="calendar-grid-panel">Mensual</button>
  <button role="tab" aria-selected="false" aria-controls="obligation-list-panel">Lista</button>
</div>

<!-- FilterChips -->
<div role="group" aria-label="Filtrar por categoría tributaria">
  <button role="checkbox" aria-checked="true">Todos</button>
  <button role="checkbox" aria-checked="false">IVA</button>
  <!-- ... -->
</div>

<!-- CalendarGrid mes-card -->
<button aria-label="Enero 2025 — 4 obligaciones. Pulsa para expandir"
        aria-expanded="false" aria-controls="month-jan-2025-panel" />
```

### Live regions

- `CountdownBanner`: `aria-live="polite"` — se actualiza cuando cambia el RIF o el año
- Toast Sonner: ya maneja su propia live region internamente
- Cambio de vista (grid ↔ lista): añadir `aria-live="polite"` en un `<span className="sr-only">` que anuncie "Vista mensual activada" / "Vista lista activada"

---

## 10. Variante embed

Activada en la ruta `/herramientas/calendario-seniat/embed`.

**Elementos ocultos:**
- Navegación principal del layout público
- Hero completo (nombre del tool, tagline, badge de autoridad)
- RifInput y TaxpayerTypeToggle (el embed asume RIF pasado por query param `?rif=J-12345678-9`)
- FaqSeniat
- Disclaimer
- ReminderOptIn trigger

**Elementos visibles:**
- YearSelector
- FilterChips
- ViewToggle
- CalendarGrid / ObligationsList
- CountdownBanner
- ExportActions (solo ICS y Copiar enlace — PNG/PDF removidos del embed)
- EmbedBadge (fijo abajo-derecha)

**Dimensiones recomendadas del iframe:**
```html
<iframe
  src="https://kontave.com/herramientas/calendario-seniat/embed?rif=J-12345678-9"
  width="100%"
  height="720"
  style="border: none; border-radius: 12px;"
  title="Calendario Tributario SENIAT — powered by Konta"
  loading="lazy"
/>
```
Altura mínima funcional: 480px (muestra 6 meses en grid-cols-2). Altura recomendada: 720px.

**Padding del embed:** reducir padding del contenedor principal a `px-4 py-4` (vs `px-4 sm:px-6 py-8 sm:py-12` en la versión pública).

---

## 11. Estados UI

### Empty (sin RIF ingresado)

El CalendarGrid se reemplaza por un estado vacío centrado:

```
className="flex flex-col items-center justify-center gap-4 py-24 text-center"
```
- Icono: `CalendarX2` en `w-12 h-12 text-text-disabled`
- H3: `text-[16px] font-sans font-semibold text-text-secondary` → "Ingresa tu RIF para consultar"
- Body: `text-[13px] font-mono text-text-tertiary max-w-[320px] leading-relaxed` → "Consulta las fechas de declaración y pago de IVA, ISLR, IGTF y más obligaciones del SENIAT para tu empresa."
- CTA: ninguno (el `RifInput` ya está visible en el hero)

La stat-card de próxima obligación en el hero muestra un skeleton `animate-pulse bg-surface-2 rounded-lg h-16 w-full`.

### Loading (fetching empresas / fetching obligaciones)

```
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
```
12 tarjetas skeleton:
```
className="rounded-xl border border-border-light bg-surface-2 animate-pulse h-[140px]"
```

El stagger se aplica al grupo, no a cada skeleton individualmente.

### Error (RIF inválido)

- `RifInput` en estado `invalid` con message "RIF no encontrado en el registro SENIAT."
- CalendarGrid reemplazado por estado de error:
  ```
  className="flex flex-col items-center justify-center gap-3 py-20"
  ```
  Icono `AlertCircle` en `text-text-error`. Mensaje en `text-[13px] font-mono text-text-error/80`. Botón `BaseButton.Root variant="ghost" size="sm"` → "Intentar con otro RIF".

- Error de red (sin conexión): mismo layout pero con icono `WifiOff` y mensaje "Sin conexión. Verifica tu internet e intenta de nuevo." + botón "Reintentar" con `variant="secondary"`.

El error se announce via `role="alert" aria-live="assertive"` para screen readers.

### Skeleton (pre-data, estado de carga inicial)

```html
<!-- Stat-card en hero -->
<div className="animate-pulse flex flex-col gap-2 p-4">
  <div className="h-3 bg-surface-3 rounded-md w-24" />
  <div className="h-7 bg-surface-3 rounded-md w-40" />
  <div className="h-3 bg-surface-3 rounded-md w-20" />
</div>

<!-- Cada mes-card -->
<div className="rounded-xl border border-border-light bg-surface-2 animate-pulse overflow-hidden">
  <div className="h-10 bg-surface-3 border-b border-border-light" />
  <div className="p-4 flex flex-col gap-2">
    <div className="h-2 bg-surface-3 rounded-full w-full" />
    <div className="h-2 bg-surface-3 rounded-full w-3/4" />
    <div className="h-2 bg-surface-3 rounded-full w-1/2" />
  </div>
</div>
```

Las animaciones `animate-pulse` respetan la declaración en `globals.css` que desactiva `transition` para elementos con `animate-*`.
