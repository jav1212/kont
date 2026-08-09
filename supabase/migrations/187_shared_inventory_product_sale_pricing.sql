-- Shared catalog sale pricing. Existing products remain unconfigured.
ALTER TABLE public.shared_inventory_products
    ADD COLUMN IF NOT EXISTS sale_price_mode text,
    ADD COLUMN IF NOT EXISTS sale_price_value numeric(14,4),
    ADD COLUMN IF NOT EXISTS sale_price_currency char(1);

ALTER TABLE public.shared_inventory_products
    DROP CONSTRAINT IF EXISTS shared_inventory_products_sale_pricing_check;

ALTER TABLE public.shared_inventory_products
    ADD CONSTRAINT shared_inventory_products_sale_pricing_check CHECK (
        (
            sale_price_mode IS NULL
            AND sale_price_value IS NULL
            AND sale_price_currency IS NULL
        )
        OR
        (
            sale_price_mode = 'fixed'
            AND sale_price_value > 0
            AND sale_price_currency IN ('B', 'D')
        )
        OR
        (
            sale_price_mode = 'markup'
            AND sale_price_value >= 0
            AND sale_price_currency IN ('B', 'D')
        )
    );

COMMENT ON COLUMN public.shared_inventory_products.sale_price_mode
    IS 'Optional catalog pricing strategy: fixed amount or markup over average cost.';
COMMENT ON COLUMN public.shared_inventory_products.sale_price_value
    IS 'Fixed sale amount or markup percentage, according to sale_price_mode.';
COMMENT ON COLUMN public.shared_inventory_products.sale_price_currency
    IS 'Preferred sale entry currency: B=VES, D=USD.';
