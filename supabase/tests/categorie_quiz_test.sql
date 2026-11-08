-- ============================================================
-- TESTS — catégorie « quiz » des contenus marketing (Q1)
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conname = 'marketing_contenus_categorie_check';
  if def is null or position('quiz' in def) = 0 then
    raise exception 'ÉCHEC Q1 : la catégorie quiz n''est pas admise (%)', def;
  end if;
  if position('inventee' in def) > 0 then
    raise exception 'ÉCHEC Q1b : contrainte trop large';
  end if;
  raise notice 'Q1 OK — catégorie quiz admise, liste toujours fermée';
end $$;
