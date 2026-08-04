-- 131_shared_accounting_pilot.sql
-- Accounting data is tenant-scoped at every primary key and foreign key.

CREATE TABLE IF NOT EXISTS public.shared_accounting_charts (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.shared_accounting_accounts (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, chart_id text, code text NOT NULL, name text NOT NULL,
    type text NOT NULL, parent_code text, is_active boolean NOT NULL DEFAULT true, is_group boolean NOT NULL DEFAULT false,
    opening_balance numeric(18,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,company_id,code),
    CHECK (type IN ('asset','liability','equity','revenue','expense')),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,chart_id) REFERENCES public.shared_accounting_charts(tenant_id,id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS public.shared_accounting_periods (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, name text NOT NULL, start_date date NOT NULL, end_date date NOT NULL,
    status text NOT NULL DEFAULT 'open', closed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), CHECK (status IN ('open','closed')),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.shared_accounting_entries (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, period_id text NOT NULL, entry_number integer NOT NULL, entry_date date NOT NULL,
    description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft', source text NOT NULL DEFAULT 'manual', source_ref text,
    posted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id), CHECK (status IN ('draft','posted')), CHECK (source IN ('manual','payroll','inventory')),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,period_id) REFERENCES public.shared_accounting_periods(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS public.shared_accounting_entry_lines (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, entry_id text NOT NULL, account_id text NOT NULL, type text NOT NULL, amount numeric(18,4) NOT NULL,
    description text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,id),
    CHECK (type IN ('debit','credit')), CHECK (amount > 0),
    FOREIGN KEY (tenant_id,entry_id) REFERENCES public.shared_accounting_entries(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,account_id) REFERENCES public.shared_accounting_accounts(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS public.shared_accounting_integration_rules (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, source text NOT NULL, debit_account_id text NOT NULL, credit_account_id text NOT NULL,
    amount_field text NOT NULL DEFAULT 'total', description text NOT NULL DEFAULT '', is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,id),
    CHECK (source IN ('payroll','inventory_purchase','inventory_movement')),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,debit_account_id) REFERENCES public.shared_accounting_accounts(tenant_id,id),
    FOREIGN KEY (tenant_id,credit_account_id) REFERENCES public.shared_accounting_accounts(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS public.shared_accounting_integration_log (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    id text NOT NULL, company_id text NOT NULL, source text NOT NULL, source_ref text NOT NULL, entry_id text,
    status text NOT NULL, error_message text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,id),
    CHECK (status IN ('success','error','skipped')),
    FOREIGN KEY (tenant_id,company_id) REFERENCES public.shared_companies(tenant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id,entry_id) REFERENCES public.shared_accounting_entries(tenant_id,id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS shared_acc_accounts_company_idx ON public.shared_accounting_accounts(tenant_id,company_id);
CREATE INDEX IF NOT EXISTS shared_acc_periods_company_idx ON public.shared_accounting_periods(tenant_id,company_id);
CREATE INDEX IF NOT EXISTS shared_acc_entries_company_period_idx ON public.shared_accounting_entries(tenant_id,company_id,period_id);
CREATE INDEX IF NOT EXISTS shared_acc_lines_entry_idx ON public.shared_accounting_entry_lines(tenant_id,entry_id);
CREATE INDEX IF NOT EXISTS shared_acc_lines_account_idx ON public.shared_accounting_entry_lines(tenant_id,account_id);
CREATE INDEX IF NOT EXISTS shared_acc_rules_company_idx ON public.shared_accounting_integration_rules(tenant_id,company_id);
CREATE INDEX IF NOT EXISTS shared_acc_log_company_ref_idx ON public.shared_accounting_integration_log(tenant_id,company_id,source_ref);

DO $$
DECLARE r record; n bigint;
BEGIN
 FOR r IN SELECT id,schema_name FROM public.tenants LOOP
  EXECUTE format('SELECT count(*) FROM %I.accounting_charts x LEFT JOIN public.shared_companies c ON c.tenant_id=%L::uuid AND c.id=x.company_id WHERE c.id IS NULL',r.schema_name,r.id) INTO n; IF n>0 THEN RAISE EXCEPTION 'Tenant % accounting charts without company: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.accounting_accounts x LEFT JOIN public.shared_companies c ON c.tenant_id=%L::uuid AND c.id=x.company_id WHERE c.id IS NULL',r.schema_name,r.id) INTO n; IF n>0 THEN RAISE EXCEPTION 'Tenant % accounting accounts without company: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.accounting_entries x LEFT JOIN %I.accounting_periods p ON p.id=x.period_id WHERE p.id IS NULL',r.schema_name,r.schema_name) INTO n; IF n>0 THEN RAISE EXCEPTION 'Tenant % accounting entries without local period: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.accounting_entry_lines x LEFT JOIN %I.accounting_entries e ON e.id=x.entry_id WHERE e.id IS NULL',r.schema_name,r.schema_name) INTO n; IF n>0 THEN RAISE EXCEPTION 'Tenant % accounting lines without local entry: %',r.id,n; END IF;
  EXECUTE format('SELECT count(*) FROM %I.accounting_entry_lines x LEFT JOIN %I.accounting_accounts a ON a.id=x.account_id WHERE a.id IS NULL',r.schema_name,r.schema_name) INTO n; IF n>0 THEN RAISE EXCEPTION 'Tenant % accounting lines without local account: %',r.id,n; END IF;
  EXECUTE format($q$INSERT INTO public.shared_accounting_charts(tenant_id,id,company_id,name,created_at,updated_at) SELECT %L::uuid,id,company_id,name,created_at,updated_at FROM %I.accounting_charts ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_accounting_accounts(tenant_id,id,company_id,chart_id,code,name,type,parent_code,is_active,is_group,opening_balance,created_at,updated_at) SELECT %L::uuid,id,company_id,chart_id,code,name,type,parent_code,is_active,is_group,saldo_inicial,created_at,updated_at FROM %I.accounting_accounts ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_accounting_periods(tenant_id,id,company_id,name,start_date,end_date,status,closed_at,created_at,updated_at) SELECT %L::uuid,id,company_id,name,start_date,end_date,status,closed_at,created_at,updated_at FROM %I.accounting_periods ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_accounting_entries(tenant_id,id,company_id,period_id,entry_number,entry_date,description,status,source,source_ref,posted_at,created_at,updated_at) SELECT %L::uuid,id,company_id,period_id,entry_number,date,description,status,source,source_ref,posted_at,created_at,updated_at FROM %I.accounting_entries ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_accounting_entry_lines(tenant_id,id,entry_id,account_id,type,amount,description,created_at) SELECT %L::uuid,id,entry_id,account_id,type,amount,description,created_at FROM %I.accounting_entry_lines ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_accounting_integration_rules(tenant_id,id,company_id,source,debit_account_id,credit_account_id,amount_field,description,is_active,created_at,updated_at) SELECT %L::uuid,id,company_id,source,debit_account_id,credit_account_id,amount_field,description,is_active,created_at,updated_at FROM %I.accounting_integration_rules ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
  EXECUTE format($q$INSERT INTO public.shared_accounting_integration_log(tenant_id,id,company_id,source,source_ref,entry_id,status,error_message,created_at) SELECT %L::uuid,id,company_id,source,source_ref,entry_id,status,error_message,created_at FROM %I.accounting_integration_log ON CONFLICT DO NOTHING$q$,r.id,r.schema_name);
 END LOOP;
END $$;

ALTER TABLE public.shared_accounting_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_accounting_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_accounting_integration_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_accounting_integration_log ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT unnest(ARRAY['shared_accounting_charts','shared_accounting_accounts','shared_accounting_periods','shared_accounting_entries','shared_accounting_entry_lines','shared_accounting_integration_rules','shared_accounting_integration_log']) LOOP
  EXECUTE format('DROP POLICY IF EXISTS %I_member_access ON public.%I',t,t);
  EXECUTE format('CREATE POLICY %I_member_access ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=%I.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=%I.tenant_id AND m.member_id=auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL))',t,t,t,t);
 END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.shared_accounting_charts,public.shared_accounting_accounts,public.shared_accounting_periods,public.shared_accounting_entries,public.shared_accounting_entry_lines,public.shared_accounting_integration_rules,public.shared_accounting_integration_log TO authenticated;
