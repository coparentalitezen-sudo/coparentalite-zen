-- ============================================================
-- TESTS — micro-niche « noel » (N1)
-- ============================================================
\set ON_ERROR_STOP on

set role service_role;

do $$
begin
  if not exists (select 1 from public.marketing_niches where id = 'noel') then
    raise exception 'ÉCHEC N1 : la niche noel est absente';
  end if;
  raise notice 'N1 OK — niche noel présente';
end $$;
reset role;
