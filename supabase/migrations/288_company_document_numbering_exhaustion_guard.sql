-- The legacy allocator uses lpad(number, 8, '0'). Retain 100000000 only as
-- an exhausted sentinel after allocating 99999999; its next increment must
-- fail atomically before any truncated identifier can be saved.
create function public.guard_company_document_numbering_bounds()
returns trigger language plpgsql set search_path = public as $$
begin
    if new.proximo_numero_factura_venta > 100000000
        or new.proximo_numero_nota_entrega > 100000000 then
        raise exception 'COMPANY_DOCUMENT_NUMBER_EXHAUSTED';
    end if;
    if coalesce(new.proximo_numero_factura_venta, 1) < 1
        or new.proximo_numero_nota_entrega < 1 then
        raise exception 'COMPANY_DOCUMENT_NUMBER_INVALID';
    end if;
    return new;
end;
$$;

create trigger shared_companies_document_numbering_bounds
before insert or update of proximo_numero_factura_venta, proximo_numero_nota_entrega
on public.shared_companies
for each row execute function public.guard_company_document_numbering_bounds();

revoke all on function public.guard_company_document_numbering_bounds()
from public, anon, authenticated;
