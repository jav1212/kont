-- =============================================================================
-- 058_payment_method_credit.sql
-- Agrega 'credit' como método de pago válido. Se usa cuando un pago queda
-- completamente cubierto por crédito de referidos (amount_usd final = 0) y el
-- sistema lo auto-aprueba sin comprobante.
-- =============================================================================

ALTER TABLE public.payment_requests
    DROP CONSTRAINT IF EXISTS payment_requests_payment_method_check;

ALTER TABLE public.payment_requests
    ADD CONSTRAINT payment_requests_payment_method_check
    CHECK (payment_method IN ('transfer', 'cash', 'credit'));
