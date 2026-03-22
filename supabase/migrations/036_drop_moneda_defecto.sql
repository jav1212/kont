-- Remove moneda_defecto from productos table.
-- Currency is now set per-item on each invoice line, not on the product itself.

CREATE OR REPLACE FUNCTION drop_moneda_defecto_from_all_tenants()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name LIKE 'tenant_%'
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = r.schema_name
              AND table_name   = 'productos'
              AND column_name  = 'moneda_defecto'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I.productos DROP COLUMN moneda_defecto',
                r.schema_name
            );
        END IF;
    END LOOP;
END;
$$;

SELECT drop_moneda_defecto_from_all_tenants();
DROP FUNCTION drop_moneda_defecto_from_all_tenants();
