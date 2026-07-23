-- ============================================================
-- TESTS — création de dépense transactionnelle, revue, rythme de garde
-- Contexte : foyer A (Alice owner, Bob parent, Mia médiatrice), enfant Léa.
-- ============================================================
\set ON_ERROR_STOP on

-- ============ T40 : création complète en une transaction ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare eid uuid; n int;
begin
  eid := public.create_expense_full(
    'aaaaaaaa-0000-0000-0000-000000000001', 'Cantine avril', 9001, current_date, null,
    '00000000-0000-0000-0000-00000000000a',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":4501,"basis_points":5000},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":4500,"basis_points":5000}]'::jsonb);
  select count(*) into n from expense_shares where expense_id = eid;
  if n <> 2 then raise exception 'ÉCHEC T40 : parts non créées (%)', n; end if;
  select count(*) into n from expense_children where expense_id = eid;
  if n <> 1 then raise exception 'ÉCHEC T40b : enfant non rattaché'; end if;
  if (select status from expenses where id = eid) <> 'sent' then
    raise exception 'ÉCHEC T40c : statut initial incorrect';
  end if;
  perform set_config('app.t40_expense', eid::text, false);
  raise notice 'T40 OK — dépense + enfants + parts créés en une transaction';
end $$;

-- ============ T41 : somme des parts ≠ montant → tout est annulé ============
do $$
declare avant int; apres int;
begin
  select count(*) into avant from expenses where household_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  begin
    perform public.create_expense_full(
      'aaaaaaaa-0000-0000-0000-000000000001', 'Incohérente', 10000, current_date, null,
      '00000000-0000-0000-0000-00000000000a', null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":4000},
        {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":5000}]'::jsonb);
    raise exception 'ÉCHEC T41 : une dépense incohérente a été acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  select count(*) into apres from expenses where household_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if apres <> avant then
    raise exception 'ÉCHEC T41b : dépense orpheline laissée en base (% -> %)', avant, apres;
  end if;
  raise notice 'T41 OK — parts incohérentes rejetées, aucune dépense orpheline';
end $$;

-- ============ T42 : parent extérieur au foyer refusé ============
do $$
begin
  begin
    perform public.create_expense_full(
      'aaaaaaaa-0000-0000-0000-000000000001', 'Intrus', 1000, current_date, null,
      '00000000-0000-0000-0000-00000000000a', null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000c","owed_cents":1000}]'::jsonb);
    raise exception 'ÉCHEC T42 : une part visant un parent extérieur a été acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T42 OK — part visant un parent extérieur rejetée';
end $$;

-- ============ T43 : enfant d'un autre foyer refusé ============
do $$
begin
  begin
    perform public.create_expense_full(
      'aaaaaaaa-0000-0000-0000-000000000001', 'Enfant étranger', 1000, current_date, null,
      '00000000-0000-0000-0000-00000000000a',
      array['cccccccc-0000-0000-0000-000000000002']::uuid[],
      '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":1000}]'::jsonb);
    raise exception 'ÉCHEC T43 : un enfant d''un autre foyer a été rattaché';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T43 OK — enfant extérieur au foyer rejeté';
end $$;

-- ============ T44 : la médiatrice (lecture seule) ne peut pas créer ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$
begin
  begin
    perform public.create_expense_full(
      'aaaaaaaa-0000-0000-0000-000000000001', 'Interdit', 1000, current_date, null,
      '00000000-0000-0000-0000-00000000000d', null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000d","owed_cents":1000}]'::jsonb);
    raise exception 'ÉCHEC T44 : la médiatrice a créé une dépense';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T44 OK — création refusée en lecture seule';
end $$;

-- ============ T45 : on ne valide pas sa propre dépense ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
begin
  begin
    perform public.review_expense(current_setting('app.t40_expense')::uuid, 'validate');
    raise exception 'ÉCHEC T45 : le payeur a validé sa propre dépense';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T45 OK — auto-validation impossible';
end $$;

-- ============ T46 : le second parent valide, statut et trace ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare eid uuid := current_setting('app.t40_expense')::uuid;
begin
  perform public.review_expense(eid, 'validate', 'D''accord');
  if (select status from expenses where id = eid) <> 'validated' then
    raise exception 'ÉCHEC T46 : statut non mis à jour';
  end if;
  if not exists (select 1 from expense_comments where expense_id = eid and kind = 'validation') then
    raise exception 'ÉCHEC T46b : trace de validation absente';
  end if;
  raise notice 'T46 OK — validation par le second parent, trace conservée';
end $$;

-- ============ T47 : rythme de garde ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare rid uuid; n int;
begin
  rid := public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001', 'p2233', current_date,
           '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
  -- une seconde définition archive la première
  perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001', 'alternating_weeks', current_date,
           '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
  select count(*) into n from custody_rules
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  if n <> 1 then raise exception 'ÉCHEC T47 : % règles actives au lieu d''une', n; end if;
  raise notice 'T47 OK — une seule règle de garde active, les précédentes archivées';
end $$;

-- ============ T48 : deux parents identiques refusés ============
do $$
begin
  begin
    perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001', 'p2233', current_date,
             '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a');
    raise exception 'ÉCHEC T48 : parents identiques acceptés';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T48 OK — parents identiques refusés';
end $$;

select 'TOUS LES TESTS TRANSACTIONNELS SONT PASSÉS' as resultat;
