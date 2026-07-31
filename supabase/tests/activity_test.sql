-- ============================================================
-- TESTS — journal d'activité et métadonnées de dépense (T90 à T97)
-- ============================================================
\set ON_ERROR_STOP on

-- ============ T90 : les deux parents lisent le journal ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare n_alice int; n_bob int;
begin
  -- Alice (owner) crée de l'activité
  perform public.create_expense_full(
    'aaaaaaaa-0000-0000-0000-000000000001', 'Journal test', 5000, current_date, null,
    '00000000-0000-0000-0000-00000000000a', null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":2500,"basis_points":5000},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":2500,"basis_points":5000}]'::jsonb);
  select count(*) into n_alice from public.list_activity('aaaaaaaa-0000-0000-0000-000000000001', 500);
  if n_alice = 0 then raise exception 'ÉCHEC T90 : le propriétaire ne voit aucune activité'; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  select count(*) into n_bob from public.list_activity('aaaaaaaa-0000-0000-0000-000000000001', 500);
  if n_bob <> n_alice then
    raise exception 'ÉCHEC T90b : le second parent voit % entrées au lieu de %', n_bob, n_alice;
  end if;
  raise notice 'T90 OK — les deux parents voient le même journal (% entrées)', n_bob;
end $$;

-- ============ T91 : un foyer étranger ne voit rien ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select count(*) into n from public.list_activity('aaaaaaaa-0000-0000-0000-000000000001', 500);
  if n <> 0 then raise exception 'ÉCHEC T91 : un foyer étranger lit % entrées du journal', n; end if;
  raise notice 'T91 OK — journal invisible depuis un autre foyer';
end $$;

-- ============ T92 : ajout d'un enfant journalisé par trigger ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare cid uuid;
begin
  insert into children (household_id, first_name, created_by)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Noah',
          '00000000-0000-0000-0000-00000000000a')
  returning id into cid;
  perform set_config('app.enfant', cid::text, false);
  if not exists (select 1 from public.list_activity('aaaaaaaa-0000-0000-0000-000000000001', 500) a
                 where a.entity = 'child' and a.action = 'create' and a.entity_id = cid) then
    raise exception 'ÉCHEC T92 : ajout d''enfant non journalisé';
  end if;
  raise notice 'T92 OK — ajout d''enfant journalisé automatiquement';
end $$;

-- ============ T93 : modification d'un enfant avec avant/après ============
do $$
declare cid uuid := current_setting('app.enfant')::uuid; av text; ap text;
begin
  update children set first_name = 'Noah-Gabriel' where id = cid;
  select a.before->>'first_name', a.after->>'first_name' into av, ap
  from public.list_activity('aaaaaaaa-0000-0000-0000-000000000001', 500) a
  where a.entity = 'child' and a.action = 'update' and a.entity_id = cid
  order by a.created_at desc limit 1;
  if av <> 'Noah' or ap <> 'Noah-Gabriel' then
    raise exception 'ÉCHEC T93 : avant/après incorrects (% -> %)', av, ap;
  end if;
  raise notice 'T93 OK — modification d''enfant : ancien et nouveau prénom conservés';
end $$;

-- ============ T94 : archivage distingué d'une simple modification ============
do $$
declare cid uuid := current_setting('app.enfant')::uuid;
begin
  update children set archived_at = now() where id = cid;
  if not exists (select 1 from public.list_activity('aaaaaaaa-0000-0000-0000-000000000001', 500) a
                 where a.entity = 'child' and a.action = 'archive' and a.entity_id = cid) then
    raise exception 'ÉCHEC T94 : archivage non journalisé comme tel';
  end if;
  raise notice 'T94 OK — archivage journalisé distinctement';
end $$;

-- ============ T95 : le journal est immuable ============
do $$
declare n_avant int; n_apres int;
begin
  select count(*) into n_avant from public.list_activity('aaaaaaaa-0000-0000-0000-000000000001', 500);
  begin
    delete from audit_logs where household_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  exception when others then null;  -- refus attendu
  end;
  begin
    update audit_logs set action = 'falsifié'
     where household_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  exception when others then null;
  end;
  select count(*) into n_apres from public.list_activity('aaaaaaaa-0000-0000-0000-000000000001', 500);
  if n_apres <> n_avant then
    raise exception 'ÉCHEC T95 : le journal a été altéré (% -> %)', n_avant, n_apres;
  end if;
  if exists (select 1 from public.list_activity('aaaaaaaa-0000-0000-0000-000000000001', 500) a
             where a.action = 'falsifié') then
    raise exception 'ÉCHEC T95b : une entrée du journal a été modifiée';
  end if;
  raise notice 'T95 OK — journal ni supprimable ni modifiable';
end $$;

-- ============ T96 : métadonnées — création, validation, modification ============
do $$
declare eid uuid; m record;
begin
  eid := public.create_expense_full(
    'aaaaaaaa-0000-0000-0000-000000000001', 'Méta test', 4000, current_date, null,
    '00000000-0000-0000-0000-00000000000a', null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":2000,"basis_points":5000},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":2000,"basis_points":5000}]'::jsonb);

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  perform public.review_expense(eid, 'validate');

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  perform public.update_expense(eid, 'Méta test corrigé', 5000, current_date, null, null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":2500,"basis_points":5000},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":2500,"basis_points":5000}]'::jsonb);

  select * into m from public.expenses_meta('aaaaaaaa-0000-0000-0000-000000000001')
   where expense_id = eid;
  if m.created_at is null then raise exception 'ÉCHEC T96 : date de création absente'; end if;
  if m.validated_at is null then raise exception 'ÉCHEC T96b : date de validation absente'; end if;
  if m.last_update_at is null then raise exception 'ÉCHEC T96c : date de modification absente'; end if;
  if m.last_update_name is null then raise exception 'ÉCHEC T96d : auteur de la modification absent'; end if;
  if not m.modified_after_validation then
    raise exception 'ÉCHEC T96e : modification après validation non signalée';
  end if;
  raise notice 'T96 OK — créée / validée / modifiée par %, signalement actif', m.last_update_name;
end $$;

-- ============ T97 : dépense jamais modifiée → pas de faux signalement ============
do $$
declare eid uuid; m record;
begin
  eid := public.create_expense_full(
    'aaaaaaaa-0000-0000-0000-000000000001', 'Intacte', 3000, current_date, null,
    '00000000-0000-0000-0000-00000000000a', null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":3000,"basis_points":10000}]'::jsonb);
  select * into m from public.expenses_meta('aaaaaaaa-0000-0000-0000-000000000001') where expense_id = eid;
  if m.modified_after_validation then
    raise exception 'ÉCHEC T97 : signalement affiché sur une dépense jamais modifiée';
  end if;
  if m.last_update_at is not null then
    raise exception 'ÉCHEC T97b : date de modification renseignée à tort';
  end if;
  raise notice 'T97 OK — aucun faux signalement sur une dépense intacte';
end $$;

select 'TESTS DU JOURNAL D''ACTIVITÉ PASSÉS' as resultat;
