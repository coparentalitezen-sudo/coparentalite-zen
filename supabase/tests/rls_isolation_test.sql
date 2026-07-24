-- ============================================================
-- TESTS D'ISOLATION RLS — Coparentalité Zen
-- Exécution : psql -d czen -U authenticated -f rls_isolation_test.sql
-- (les fixtures sont créées au préalable par rls_fixtures.sql en superuser)
-- Chaque test échoue bruyamment (exception) si l'isolation est violée.
-- ============================================================

\set ON_ERROR_STOP on

-- ============ Contexte : CAROL (propriétaire du foyer B) ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);

do $$
begin
  -- Test 1 : Carol ne voit pas le foyer A
  if exists (select 1 from households where id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC T1 : Carol (foyer B) peut lire le foyer A';
  end if;
  raise notice 'T1 OK — foyer A invisible pour Carol';

  -- Test 2 : Carol ne voit pas les enfants du foyer A
  if exists (select 1 from children where household_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC T2 : Carol peut voir les enfants du foyer A';
  end if;
  raise notice 'T2 OK — enfants du foyer A invisibles';

  -- Test 3 : Carol ne voit pas les dépenses du foyer A
  if exists (select 1 from expenses where household_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC T3 : Carol peut lire les dépenses du foyer A';
  end if;
  raise notice 'T3 OK — dépenses du foyer A invisibles';

  -- Test 4 : Carol ne voit pas les justificatifs du foyer A
  if exists (select 1 from expense_attachments a
             join expenses e on e.id = a.expense_id
             where e.household_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC T4 : Carol peut lire les justificatifs du foyer A';
  end if;
  if exists (select 1 from expense_attachments
             where expense_id = 'eeeeeeee-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC T4b : Carol accède au justificatif par ID direct (URL devinée)';
  end if;
  raise notice 'T4 OK — justificatifs du foyer A inaccessibles (y compris par ID direct)';

  -- Test 5 : Carol ne voit pas les documents du foyer A
  if exists (select 1 from documents where household_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC T5 : Carol peut lire les documents du foyer A';
  end if;
  raise notice 'T5 OK — documents du foyer A invisibles';

  -- Test 6 : Carol voit bien SON foyer et SES données
  if not exists (select 1 from households where id = 'bbbbbbbb-0000-0000-0000-000000000002') then
    raise exception 'ÉCHEC T6 : Carol ne voit plus son propre foyer (RLS trop restrictive)';
  end if;
  raise notice 'T6 OK — Carol accède normalement à son foyer B';
end $$;

-- Test 7 : Carol tente de MODIFIER une dépense du foyer A.
-- Depuis la migration 00013, l'écriture directe sur expenses n'est plus
-- seulement filtrée par la RLS : elle est refusée au niveau des privilèges.
-- La garantie est donc plus forte qu'avant — on vérifie les deux voies.
do $$
begin
  begin
    update expenses set title = 'PIRATÉ' where id = 'dddddddd-0000-0000-0000-000000000001';
    -- si l'écriture directe passait encore, la RLS doit au moins n'avoir touché aucune ligne
  exception when insufficient_privilege then
    null;  -- refus attendu
  end;
  -- voie légitime : la fonction serveur doit refuser un foyer étranger
  begin
    perform public.update_expense('dddddddd-0000-0000-0000-000000000001', 'PIRATÉ', 100,
      current_date, null, null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000c","owed_cents":100}]'::jsonb);
    raise exception 'ÉCHEC T7b : la fonction serveur a accepté une dépense d''un autre foyer';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  if exists (select 1 from expenses where title = 'PIRATÉ') then
    raise exception 'ÉCHEC T7 : Carol a modifié une dépense du foyer A';
  end if;
  raise notice 'T7 OK — modification inter-foyers bloquée (privilèges + fonction serveur)';
end $$;

-- ============ Contexte : MALLORY (aucun foyer) ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
do $$
declare n int;
begin
  select count(*) into n from households;
  if n > 0 then raise exception 'ÉCHEC T8 : Mallory (aucun foyer) voit % foyer(s)', n; end if;
  select count(*) into n from children;
  if n > 0 then raise exception 'ÉCHEC T8b : Mallory voit % enfant(s)', n; end if;
  select count(*) into n from expenses;
  if n > 0 then raise exception 'ÉCHEC T8c : Mallory voit % dépense(s)', n; end if;
  raise notice 'T8 OK — utilisateur sans foyer : zéro donnée visible';
end $$;

-- Test 9 : Mallory tente d'insérer une dépense dans le foyer A → refus RLS
do $$
begin
  begin
    insert into expenses (household_id, title, amount_cents, spent_on, paid_by, created_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Injection', 100, current_date,
            '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000e');
    raise exception 'ÉCHEC T9 : Mallory a inséré une dépense dans le foyer A';
  exception when insufficient_privilege or others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    raise notice 'T9 OK — insertion inter-foyers rejetée (%)', sqlerrm;
  end;
end $$;

-- ============ Contexte : BOB (parent du foyer A) ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
begin
  if not exists (select 1 from expenses where id = 'dddddddd-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC T10 : Bob (parent A) ne voit pas la dépense de son foyer';
  end if;
  if not exists (select 1 from children_medical
                 where household_id = 'aaaaaaaa-0000-0000-0000-000000000001'
                   and allergies is not null) then
    raise exception 'ÉCHEC T11 : Bob (parent) n''accède pas aux données médicales de son enfant';
  end if;
  raise notice 'T10-T11 OK — Bob accède aux dépenses et aux données médicales de son foyer';
end $$;

-- ============ Contexte : MIA (médiatrice, lecture seule, foyer A) ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$
begin
  if not exists (select 1 from expenses where household_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC T12 : la médiatrice ne peut pas lire les dépenses du foyer A';
  end if;
  raise notice 'T12 OK — médiatrice : lecture du foyer A autorisée';

  -- lecture seule : l'écriture doit être refusée
  begin
    insert into expenses (household_id, title, amount_cents, spent_on, paid_by, created_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Interdit', 100, current_date,
            '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d');
    raise exception 'ÉCHEC T13 : la médiatrice (lecture seule) a créé une dépense';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    raise notice 'T13 OK — écriture refusée pour la médiatrice';
  end;

  -- données médicales : masquées pour la médiatrice
  if exists (select 1 from children_medical
             where household_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC T14 : la médiatrice accède aux données médicales';
  end if;
  raise notice 'T14 OK — données médicales masquées pour la médiatrice';
end $$;

select 'TOUS LES TESTS D''ISOLATION RLS SONT PASSÉS' as resultat;

-- ============ T15 : un parent ne peut pas renommer l'autre ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
update profiles set display_name = 'PIRATÉ'
where id = '00000000-0000-0000-0000-00000000000a';
do $$
begin
  if exists (select 1 from profiles where display_name = 'PIRATÉ') then
    raise exception 'ÉCHEC T15 : un parent a renommé le profil d''un autre';
  end if;
  -- mais il peut renommer le sien
  update profiles set display_name = 'Bob renommé' where id = auth.uid();
  if not exists (select 1 from profiles where id = auth.uid() and display_name = 'Bob renommé') then
    raise exception 'ÉCHEC T15b : un utilisateur ne peut pas renommer son propre profil';
  end if;
  raise notice 'T15 OK — renommage limité à son propre profil';
end $$;
