-- Evaluate auth.uid() once per statement instead of once per row in shared RLS.
do $$
declare
    p record;
    using_expr text;
    check_expr text;
    statement text;
begin
    for p in
        select schemaname, tablename, policyname, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename like 'shared_%'
          and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
    loop
        using_expr := regexp_replace(p.qual, 'auth\.uid\(\)', '(select auth.uid())', 'g');
        statement := format(
            'alter policy %I on %I.%I using %s',
            p.policyname, p.schemaname, p.tablename, using_expr
        );
        if p.with_check is not null then
            check_expr := regexp_replace(p.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g');
            statement := statement || format(' with check %s', check_expr);
        end if;
        execute statement;
    end loop;
end
$$;
