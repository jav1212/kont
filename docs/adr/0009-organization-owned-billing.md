# ADR 0009: Facturación propiedad de la organización

- Estado: aceptado
- Fecha: 2026-08-11

## Decisión

La cuenta de facturación, suscripciones, facturas, métodos de pago, capacidades y consumo pertenecen a `Organization`. Un usuario solo accede a estos recursos mediante una membresía activa y un rol autorizado.

El dominio portable se encuentra en `packages/billing/domain`; no depende de Supabase, Next.js, Electron ni de un proveedor de pagos. `application` declara puertos y permisos, mientras `supabase` traduce persistencia y el vocabulario histórico.

Los importes monetarios se representan en unidades menores enteras y con moneda explícita. Las referencias de métodos de pago son tokens del proveedor; nunca se almacenan datos completos de tarjetas.

## Compatibilidad

La migración 199 es aditiva y no se ejecuta como parte de este cambio de código. Mantiene intactos `tenants`, `tenant_subscriptions`, `payment_requests` y `/api/billing/*`. El backfill copia suscripciones existentes a la organización correspondiente y un trigger mantiene compatibilidad temporal desde las escrituras históricas.

No se convierten solicitudes de pago en facturas, porque representan conceptos distintos. Las tablas de facturas y métodos de pago comienzan vacías hasta integrar un flujo real de cobro.

## Autorización

- Miembro activo: resumen, suscripciones, capacidades y uso.
- Owner, admin o accountant: facturas.
- Owner o admin: métodos de pago.

El adaptador usa service role únicamente detrás de casos de uso que verifican membresía. Las políticas RLS aplican las mismas restricciones para acceso autenticado directo.

## API nativa

- `GET /api/native/v1/organizations/:id/billing`
- `GET /api/native/v1/organizations/:id/subscription`
- `GET /api/native/v1/organizations/:id/entitlements`
- `GET /api/native/v1/organizations/:id/usage`
- `GET /api/native/v1/organizations/:id/invoices`
- `GET /api/native/v1/organizations/:id/payment-methods`
