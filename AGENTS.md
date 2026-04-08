# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # Start development server (localhost:3000)
pnpm build      # Production build + TypeScript check
pnpm lint       # ESLint
```

There are no tests in this project.

## Architecture

**KONT** is a Venezuelan payroll management system (nómina). Built with Next.js 16 App Router, Supabase (PostgreSQL + Auth), HeroUI components, and Tailwind CSS 4.

### Routing

- `app/(public)/` — unauthenticated pages (sign-in, sign-up, forgot/reset password)
- `app/(app)/` — authenticated pages behind `CompanyProvider` context
  - `payroll/` — main quincena calculator
  - `payroll/vacaciones/`, `payroll/prestaciones/`, `payroll/utilidades/`, `payroll/liquidaciones/` — standalone benefit calculators
  - `payroll/employees/`, `payroll/history/` — employee management and payroll history
  - `billing/` — subscription/billing page
- `app/admin/` — separate admin section with its own layout and auth pages (independent of `(public)`)
- `app/api/` — Next.js Route Handlers (REST endpoints, server-side only)

### Backend layer (server-side only, used exclusively in `app/api/`)

Clean architecture with three layers per module:

1. **Domain** — interfaces and models (`src/modules/*/backend/domain/`)
2. **Application** — use cases extending `UseCase<I, O>` from `src/core/domain/use-case.ts`, returning `Result<T>` from `src/core/domain/result.ts`
3. **Infrastructure** — `Supabase*Repository` classes implementing domain repository interfaces, instantiated via factory functions

**Pattern for every API route:**
```ts
// 1. Call the factory (creates SupabaseSource + repository + use case)
const result = await getEmployeeActions().upsertEmployees.execute({ ... });
// 2. Unwrap Result<T>
if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });
return Response.json({ data: result.getValue() });
```

Factories live at `src/modules/*/backend/infra/*-factory.ts`. Never instantiate use cases directly in API routes.

### Frontend layer

- **Global state** — `CompanyProvider` wraps the entire `(app)` layout. Access via `useCompany()` hook anywhere inside. It holds the selected company and the full list of companies. Selected company ID is persisted to `localStorage`.
- **Feature hooks** — `useEmployee(companyId)` and `usePayrollHistory(companyId)` handle their own loading/error state and expose typed action methods that call the API routes.
- **No state management library** — everything is React Context + `useState`/`useCallback`/`useMemo`.

### Domain concepts

| Concept | Key fields |
|---|---|
| `Company` | `id` = RIF (e.g. `J-12345678-9`), `ownerId` = Supabase user ID |
| `Employee` | `cedula` = PK, `companyId`, `salarioMensual` in **VES (Bolívares)**, `estado`: activo/inactivo/vacacion |
| `PayrollRun` | One run per quincena: `periodStart`, `periodEnd`, `exchangeRate` (BCV rate) |
| `PayrollReceipt` | One per employee per run, stores all computed amounts |

**Salary is always VES (Bolívares). Bonuses (`BonusRow.amount`) are in USD and are converted to VES using the BCV rate.**

### Payroll calculator (`app/(app)/payroll/page.tsx`)

The main calculator page owns:
- Quincena selection (year/month/1–15 or 16–end)
- BCV rate (auto-fetched from `/api/bcv/rate` on load, or via date picker)
- Three row lists: `EarningRow[]`, `DeductionRow[]`, `BonusRow[]`
- Reference monthly salary (for formula preview only — each employee uses their own salary)

`PayrollEmployeeTable` receives these as props and runs the computation engine (`computeEmployee`) purely on the frontend — no server call for calculation. Confirmation (`onConfirm`) persists a `PayrollRun` + receipts via `usePayrollHistory`.

### Payroll computation

```
EarningRow: amount = useDaily ? qty × (salario/30) × multiplier : qty (VES)
BonusRow:   amount = usd × bcvRate  (USD → VES)
DeductionRow: amount = base_salary × (rate/100)  (base = weekly or monthly)

weekly base = (salario × 12 / 52) × mondaysInMonth
gross = Σ earnings + Σ bonuses
net   = gross − Σ deductions
netUSD = net / bcvRate
```

### CSV formats

- **Employees**: `cedula, nombre, cargo, salario_mensual_ves, estado`
- **Companies**: `rif, nombre`

Numbers use `.` as decimal separator in CSV. Venezuelan locale (`es-VE`) uses `,` — be careful when parsing API responses from `api-monitor-bcv.vercel.app` which returns rates as `"42,10"`.

### External API

- `GET /api/bcv/rate?date=YYYY-MM-DD` — proxy to `https://api-monitor-bcv.vercel.app`
  - Today → `/exchange-rate/main`, filters `code === "USD"`, uses `sell` price
  - Past date → `/exchange-rate/list?start=DATE&end=DATE`

### PDF generation

All PDF utils are pure jsPDF, no server involvement, located in `src/modules/payroll/frontend/utils/`:

- `payroll-pdf.ts` — quincena receipts per employee. Only generates for `estado === "activo"`. Accepts `periodLabel`, `periodStart`, `payrollDate`.
- `vacaciones-pdf.ts`, `prestaciones-pdf.ts`, `utilidades-pdf.ts`, `liquidaciones-pdf.ts` — standalone benefit calculation PDFs.
- `cesta-ticket-pdf.ts`, `fin-de-ano-pdf.ts` — additional benefit PDFs.

### Payroll utilities

- `aportes-patronales.ts` — employer contribution calculations (IVSS, FAOV, INCES, etc.)
- `prestaciones-calculator.ts` — LOTTT prestaciones (severance) calculation logic
- `venezuela-holidays.ts` — Venezuelan public holidays, used for date-aware calculations

### Inventory module (`app/(app)/inventory/`)

A second major feature module for inventory/warehouse management. Uses the same clean architecture pattern as payroll.

**Domain concepts:**

| Concept | Key fields |
|---|---|
| `Producto` | `codigo`, `tipo`: mercancia/materia_prima/producto_terminado, `metodoValuacion`: promedio_ponderado/peps, `existenciaActual`, `costoPromedio` |
| `Movimiento` | `tipo`: entrada_compra/salida_venta/entrada_produccion/salida_produccion/ajuste_*/devolucion_*, `periodo` (YYYY-MM), `costoUnitario`, `saldoCantidad` |
| `KardexEntry` | Extends `Movimiento` with `productoNombre` — used for the kardex report |
| `FacturaCompra` | Purchase invoice; confirmed via `confirmar-factura-compra` use case which creates `Movimiento` records |
| `Transformacion` | Production transformation (input materials → output product) |
| `Proveedor` | Supplier |

**Routes:**
- `inventory/` — dashboard
- `inventory/productos/` — product catalog
- `inventory/movimientos/` — stock movements log
- `inventory/kardex/` — kardex report per product
- `inventory/compras/`, `inventory/compras/nueva/`, `inventory/compras/[id]/` — purchase invoices
- `inventory/produccion/` — production transformations
- `inventory/proveedores/` — supplier management
- `inventory/cierres/` — period closing

Frontend hook: `useInventory(companyId)` in `src/modules/inventory/frontend/hooks/use-inventory.ts`. Repositories use RPC prefix (`rpc-*.repository.ts`) — calls Supabase RPCs rather than direct table access.

### Shared UI components

- `BaseTable` (`src/shared/frontend/components/base-table.tsx`) — HeroUI Table wrapper with optional pagination and column search. Used in payroll history. The payroll calculator uses a plain text search instead (`enableSearch` is not set).
- `BaseAudit` — renders the per-employee breakdown rows in the expanded panel.
