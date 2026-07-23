-- ============================================================
-- TESTS — modification / suppression d'une dépense (T80 à T87)
-- Foyer A : Alice (owner, payeuse), Bob (parent), Mia (médiatrice).
-- ============================================================
\set ON_ERROR_STOP on

-- Dépense de départ : 90,01 € payée par Alice, 50/50
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare eid uuid;
begin
  eid := public.create_expense_full(
    'aaaaaaaa-0000-0000-0000-000000000001', 'Cantine mai', 9001, current_date, null,
    '00000000-0000-0000-0000-00000000000a',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":4501,"basis_points":5000},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":4500,"basis_points":5000}]'::jsonb);
  perform set_config('app.dep', eid::text, false);
end $$;

-- Bob la valide
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
begin
  perform public.review_expense(current_setting('app.dep')::uuid, 'validate');
end $$;

-- ============ T80 : le parent non payeur ne peut pas modifier ============
do $$
begin
  begin
    perform public.update_expense(current_setting('app.dep')::uuid, 'Détournée', 100, current_date, null,
      null, '[{"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":100}]'::jsonb);
    raise exception 'ÉCHEC T80 : un parent non payeur a modifié la dépense';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%qui a payé%' then raise exception 'ÉCHEC T80b : mauvais motif (%)', sqlerrm; end if;
  end;
  raise notice 'T80 OK — modification réservée au parent qui a payé';
end $$;

-- ============ T81 : modification du montant + parts recalculées ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare eid uuid := current_setting('app.dep')::uuid; m bigint; s bigint;
begin
  perform public.update_expense(eid, 'Cantine mai corrigée', 6000, current_date, null,
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":3000,"basis_points":5000},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":3000,"basis_points":5000}]'::jsonb);
  select amount_cents into m from expenses where id = eid;
  if m <> 6000 then raise exception 'ÉCHEC T81 : montant non mis à jour (%)', m; end if;
  select sum(owed_cents) into s from expense_shares where expense_id = eid;
  if s <> 6000 then raise exception 'ÉCHEC T81b : parts non recalculées (%)', s; end if;
  if (select count(*) from expense_shares where expense_id = eid) <> 2 then
    raise exception 'ÉCHEC T81c : parts dupliquées';
  end if;
  raise notice 'T81 OK — montant modifié, parts recalculées sans doublon';
end $$;

-- ============ T82 : la validation précédente est annulée ============
do $$
declare st text;
begin
  select status::text into st from expenses where id = current_setting('app.dep')::uuid;
  if st <> 'sent' then
    raise exception 'ÉCHEC T82 : statut % — la dépense reste validée après modification', st;
  end if;
  raise notice 'T82 OK — la modification remet la dépense en attente de validation';
end $$;

-- ============ T83 : avant/après journalisés ============
do $$
begin
  if not public.test_audit_avant_apres('expense', current_setting('app.dep')::uuid, 9001, 6000) then
    raise exception 'ÉCHEC T83 : l''avant/après n''est pas journalisé';
  end if;
  raise notice 'T83 OK — ancien et nouveau montant conservés dans le journal';
end $$;

-- ============ T84 : somme des parts incohérente refusée, sans effet ============
do $$
declare eid uuid := current_setting('app.dep')::uuid; m bigint;
begin
  begin
    perform public.update_expense(eid, 'Incohérente', 10000, current_date, null, null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":4000},
        {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":5000}]'::jsonb);
    raise exception 'ÉCHEC T84 : parts incohérentes acceptées';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  select amount_cents into m from expenses where id = eid;
  if m <> 6000 then raise exception 'ÉCHEC T84b : la dépense a été altérée malgré le refus (%)', m; end if;
  raise notice 'T84 OK — refus sans altération de la dépense';
end $$;

-- ============ T85 : montant nul ou négatif refusé ============
do $$
declare m bigint;
begin
  foreach m in array array[0::bigint, -500::bigint] loop
    begin
      perform public.update_expense(current_setting('app.dep')::uuid, 'Nulle', m, current_date, null, null,
        '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":0}]'::jsonb);
      raise exception 'ÉCHEC T85 : montant % accepté', m;
    exception when others then
      if sqlerrm like 'ÉCHEC%' then raise; end if;
    end;
  end loop;
  raise notice 'T85 OK — montants nul et négatif refusés';
end $$;

-- ============ T86 : la médiatrice ne peut ni modifier ni supprimer ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$
begin
  begin
    perform public.delete_expense(current_setting('app.dep')::uuid);
    raise exception 'ÉCHEC T86 : la médiatrice a supprimé une dépense';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T86 OK — suppression refusée en lecture seule';
end $$;

-- ============ T87 : suppression logique par le payeur ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare eid uuid := current_setting('app.dep')::uuid;
begin
  perform public.delete_expense(eid);
  if exists (select 1 from expenses where id = eid and deleted_at is null) then
    raise exception 'ÉCHEC T87 : la dépense est toujours active';
  end if;
  if not public.test_depense_existe(eid) then
    raise exception 'ÉCHEC T87b : suppression physique au lieu de logique';
  end if;
  begin
    perform public.delete_expense(eid);
    raise exception 'ÉCHEC T87c : double suppression acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T87 OK — suppression logique, ligne conservée, non rejouable';
end $$;

select 'TESTS DE MODIFICATION DE DÉPENSE PASSÉS' as resultat;
