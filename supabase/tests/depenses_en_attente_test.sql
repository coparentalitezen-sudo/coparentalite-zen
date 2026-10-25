-- ============================================================
-- TESTS — dépenses en attente de vérification (A1 à A6)
--
-- Un parent seul, face à un second parent seulement nommé, doit voir ce que
-- représentent ses dépenses, sans que le solde officiel — réservé aux
-- dépenses validées par l'autre parent — en soit modifié.
-- ============================================================
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);

do $$
declare hid uuid; pid uuid; cid uuid;
begin
  hid := public.create_household('Foyer Solo');
  pid := public.nommer_second_parent(hid, 'Julien');
  insert into children (household_id, first_name, created_by)
  values (hid, 'Lou', '00000000-0000-0000-0000-0000000000e1') returning id into cid;
  perform set_config('app.hid', hid::text, false);
  perform set_config('app.provisoire', pid::text, false);
  perform set_config('app.enfant', cid::text, false);
  raise notice 'préparation — foyer solo, second parent nommé';
end $$;

-- ============ A1 : une dépense avancée apparaît en attente ============
do $$
declare hid uuid := current_setting('app.hid')::uuid; a record; b record; eid uuid;
begin
  eid := public.create_expense_full(hid, 'Cantine', 4000, current_date, null,
    '00000000-0000-0000-0000-0000000000e1', array[current_setting('app.enfant')::uuid],
    format('[{"parent_id":"%s","owed_cents":2000},{"parent_id":"%s","owed_cents":2000}]',
           '00000000-0000-0000-0000-0000000000e1', current_setting('app.provisoire'))::jsonb);
  perform set_config('app.depense', eid::text, false);

  select * into a from public.depenses_en_attente(hid);
  if a.parent_1 <> '00000000-0000-0000-0000-0000000000e1'::uuid then
    raise exception 'ÉCHEC A1 : parent_1 inattendu';
  end if;
  if a.net_cents <> 2000 then raise exception 'ÉCHEC A1b : % au lieu de 2000', a.net_cents; end if;
  if a.nombre <> 1 or a.total_cents <> 4000 then
    raise exception 'ÉCHEC A1c : % dépense(s), total %', a.nombre, a.total_cents;
  end if;
  raise notice 'A1 OK — 20,00 € en attente pour le parent qui a avancé 40,00 €';
end $$;

-- ============ A2 : le solde officiel n'est pas touché ============
do $$
declare b record;
begin
  select * into b from public.household_balance(current_setting('app.hid')::uuid);
  if b.net_cents <> 0 or b.depenses_prises_en_compte <> 0 then
    raise exception 'ÉCHEC A2 : solde % sur % dépense(s)', b.net_cents, b.depenses_prises_en_compte;
  end if;
  raise notice 'A2 OK — le solde reste réservé aux dépenses validées';
end $$;

-- ============ A3 : une dépense payée par l'autre parent se déduit ============
do $$
declare hid uuid := current_setting('app.hid')::uuid; a record;
begin
  perform public.create_expense_full(hid, 'Chaussures', 3000, current_date, null,
    current_setting('app.provisoire')::uuid, array[current_setting('app.enfant')::uuid],
    format('[{"parent_id":"%s","owed_cents":1500},{"parent_id":"%s","owed_cents":1500}]',
           '00000000-0000-0000-0000-0000000000e1', current_setting('app.provisoire'))::jsonb);
  select * into a from public.depenses_en_attente(hid);
  if a.net_cents <> 500 then raise exception 'ÉCHEC A3 : % au lieu de 500', a.net_cents; end if;
  if a.nombre <> 2 or a.total_cents <> 7000 then
    raise exception 'ÉCHEC A3b : % dépense(s), total %', a.nombre, a.total_cents;
  end if;
  raise notice 'A3 OK — même convention de signe que le solde (net 5,00 €)';
end $$;

-- ============ A4 : un non-membre ne lit rien ============
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);
  begin
    perform public.depenses_en_attente(current_setting('app.hid')::uuid);
    raise exception 'ÉCHEC A4 : lecture accordée à un non-membre';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%inaccessible%' then raise exception 'ÉCHEC A4b : motif (%)', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
  raise notice 'A4 OK — foyer inaccessible à un non-membre';
end $$;

-- ============ A5 : après validation, la dépense quitte l'attente ============
do $$
declare hid uuid := current_setting('app.hid')::uuid; a record; b record;
begin
  if not public.test_fusionner(hid, '00000000-0000-0000-0000-0000000000e2') then
    raise exception 'ÉCHEC A5 : fusion impossible';
  end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);
  perform public.review_expense(current_setting('app.depense')::uuid, 'validate');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);

  select * into a from public.depenses_en_attente(hid);
  select * into b from public.household_balance(hid);
  if a.nombre <> 1 then raise exception 'ÉCHEC A5b : % dépense(s) encore en attente', a.nombre; end if;
  if abs(b.net_cents) <> 2000 then raise exception 'ÉCHEC A5c : solde %', b.net_cents; end if;
  raise notice 'A5 OK — validée, la dépense passe de l''attente au solde';
end $$;

-- ============ A6 : fermé aux visiteurs anonymes ============
do $$
begin
  if has_function_privilege('anon', 'public.depenses_en_attente(uuid)', 'execute') then
    raise exception 'ÉCHEC A6 : exécutable par anon';
  end if;
  raise notice 'A6 OK — réservé aux utilisateurs connectés';
end $$;

select 'TESTS DES DÉPENSES EN ATTENTE PASSÉS' as resultat;
