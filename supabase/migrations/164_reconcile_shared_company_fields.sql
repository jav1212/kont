-- 164_reconcile_shared_company_fields.sql
-- Reconciliacion segura de empresas cuando legacy es estrictamente mas reciente.

DO $$
DECLARE
    t record;
BEGIN
    FOR t IN SELECT id, schema_name FROM public.tenants LOOP
        IF to_regclass(format('%I.companies', t.schema_name)) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format($sql$
            INSERT INTO public.shared_schema_reconciliation_audit
                (tenant_id, source_table, source_id, action, details)
            SELECT
                %L::uuid,
                'companies',
                l.id,
                'reconciled_legacy_newer',
                jsonb_build_object(
                    'legacy_updated_at', l.updated_at,
                    'shared_updated_at', s.updated_at,
                    'previous_shared', to_jsonb(s),
                    'legacy_source', to_jsonb(l)
                )
            FROM %I.companies l
            JOIN public.shared_companies s
              ON s.tenant_id = %L::uuid
             AND s.id = l.id
            WHERE l.updated_at > s.updated_at
              AND ROW(l.name,l.rif,l.config_fiscal,l.phone,l.address,l.logo_url,
                      l.payroll_settings,l.show_logo_in_pdf,l.sector,l.inventory_config,
                      l.taxpayer_type,l.contact_email,l.proximo_numero_factura_venta)
                  IS DISTINCT FROM
                  ROW(s.name,s.rif,s.config_fiscal,s.phone,s.address,s.logo_url,
                      s.payroll_settings,s.show_logo_in_pdf,s.sector,s.inventory_config,
                      s.taxpayer_type,s.contact_email,s.proximo_numero_factura_venta)
        $sql$, t.id, t.schema_name, t.id);

        EXECUTE format($sql$
            UPDATE public.shared_companies s
               SET name = l.name,
                   rif = l.rif,
                   config_fiscal = l.config_fiscal,
                   phone = l.phone,
                   address = l.address,
                   logo_url = l.logo_url,
                   payroll_settings = l.payroll_settings,
                   show_logo_in_pdf = l.show_logo_in_pdf,
                   sector = l.sector,
                   inventory_config = l.inventory_config,
                   taxpayer_type = l.taxpayer_type,
                   contact_email = l.contact_email,
                   proximo_numero_factura_venta = l.proximo_numero_factura_venta,
                   updated_at = l.updated_at
              FROM %I.companies l
             WHERE s.tenant_id = %L::uuid
               AND s.id = l.id
               AND l.updated_at > s.updated_at
               AND ROW(l.name,l.rif,l.config_fiscal,l.phone,l.address,l.logo_url,
                       l.payroll_settings,l.show_logo_in_pdf,l.sector,l.inventory_config,
                       l.taxpayer_type,l.contact_email,l.proximo_numero_factura_venta)
                   IS DISTINCT FROM
                   ROW(s.name,s.rif,s.config_fiscal,s.phone,s.address,s.logo_url,
                       s.payroll_settings,s.show_logo_in_pdf,s.sector,s.inventory_config,
                       s.taxpayer_type,s.contact_email,s.proximo_numero_factura_venta)
        $sql$, t.schema_name, t.id);
    END LOOP;
END $$;
