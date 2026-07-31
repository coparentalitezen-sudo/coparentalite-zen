-- ============================================================
-- TESTS — second parent nommé avant son inscription (P1 à P9)
--
-- Le premier parent configure tout son foyer, en nommant simplement l'autre
-- parent. Quand celui-ci accepte l'invitation, il doit hériter de TOUT ce qui
-- lui était rattaché — sans quoi une configuration entière serait perdue au
-- moment le plus visible.
-- ============================================================
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);

-- Foyer neuf, créé par un parent seul
do $$
declare hid uuid;
begin
  hid := public.create_household('Foyer Provisoire');
  perform set_config('app.hid', hid::text, false);
  raise notice 'préparation — foyer créé';
end $$;

-- ============ P1 : nommer le second parent ============
do $$
declare pid uuid; n int;
begin
  pid := public.nommer_second_parent(current_setting('app.hid')::uuid, 'Camille');
  if pid is null then raise exception 'ÉCHEC P1 : aucun profil créé'; end if;
  perform set_config('app.provisoire', pid::text, false);

  select count(*) into n from public.test_comptables(current_setting('app.hid')::uuid);
  if n <> 2 then raise exception 'ÉCHEC P1b : % parents comptables au lieu de 2', n; end if;
  raise notice 'P1 OK — second parent nommé, le foyer compte deux parents';
end $$;

-- ============ P2 : le profil provisoire ne peut pas se connecter ============
do $$
declare p record;
begin
  select * into p from profiles where id = current_setting('app.provisoire')::uuid;
  if not p.is_placeholder then raise exception 'ÉCHEC P2 : profil non marqué provisoire'; end if;
  if p.email not like '%@coparentalite-zen.invalid' then
    raise exception 'ÉCHEC P2b : adresse potentiellement délivrable (%)', p.email;
  end if;
  if p.placeholder_household is null then
    raise exception 'ÉCHEC P2c : profil provisoire non rattaché à son foyer';
  end if;
  raise notice 'P2 OK — profil sans compte, adresse non délivrable';
end $$;

-- ============ P3 : renommer plutôt que dupliquer ============
do $$
declare pid uuid; n int;
begin
  pid := public.nommer_second_parent(current_setting('app.hid')::uuid, 'Camille Martin');
  if pid <> current_setting('app.provisoire')::uuid then
    raise exception 'ÉCHEC P3 : un second profil provisoire a été créé';
  end if;
  select count(*) into n from public.test_comptables(current_setting('app.hid')::uuid);
  if n <> 2 then raise exception 'ÉCHEC P3b : % parents après renommage', n; end if;
  raise notice 'P3 OK — le profil est renommé, jamais dupliqué';
end $$;

-- ============ P4 : le rythme se définit avant l'invitation ============
do $$
declare rid uuid;
begin
  rid := public.set_custody_rule(current_setting('app.hid')::uuid,
    'alternating_weeks'::custody_pattern, current_date - 7,
    '00000000-0000-0000-0000-0000000000e1',
    current_setting('app.provisoire')::uuid);
  if rid is null then raise exception 'ÉCHEC P4 : rythme refusé avec un parent provisoire'; end if;
  raise notice 'P4 OK — le rythme se configure sans attendre l''inscription du second parent';
end $$;

-- ============ P5 : dépenses et périodes se rattachent au provisoire ============
do $$
declare cid uuid; eid uuid; xid uuid;
begin
  insert into children (household_id, first_name, created_by)
  values (current_setting('app.hid')::uuid, 'Lou', '00000000-0000-0000-0000-0000000000e1')
  returning id into cid;
  perform set_config('app.enfant', cid::text, false);

  eid := public.create_expense_full(current_setting('app.hid')::uuid, 'Cantine', 4000,
    current_date, null, '00000000-0000-0000-0000-0000000000e1', array[cid],
    format('[{"parent_id":"%s","owed_cents":2000},{"parent_id":"%s","owed_cents":2000}]',
           '00000000-0000-0000-0000-0000000000e1',
           current_setting('app.provisoire'))::jsonb);
  perform set_config('app.depense', eid::text, false);

  select x into xid from public.create_custody_exception(
    current_setting('app.hid')::uuid, 'swap', array[cid],
    current_setting('app.provisoire')::uuid,
    (current_date + 5)::timestamptz, (current_date + 7)::timestamptz,
    'Chez Camille', null, null, null) x;
  perform set_config('app.exception', xid::text, false);
  raise notice 'P5 OK — dépense et période de garde rattachées au parent nommé';
end $$;

-- ============ P6 : la fusion transfère TOUT au compte réel ============
do $$
declare hid uuid := current_setting('app.hid')::uuid;
        prov uuid := current_setting('app.provisoire')::uuid;
        reel uuid := '00000000-0000-0000-0000-0000000000e2';
        fusionne boolean;
        n int;
begin
  fusionne := public.test_fusionner(hid, reel);
  if not fusionne then raise exception 'ÉCHEC P6 : la fusion n''a pas eu lieu'; end if;

  -- plus aucune référence au profil provisoire
  select count(*) into n from custody_exceptions
   where household_id = hid and parent_id = prov and deleted_at is null;
  if n > 0 then raise exception 'ÉCHEC P6a : % période(s) encore chez le provisoire', n; end if;

  select count(*) into n from expense_shares s
   join expenses e on e.id = s.expense_id
   where e.household_id = hid and s.parent_id = prov;
  if n > 0 then raise exception 'ÉCHEC P6b : % part(s) encore chez le provisoire', n; end if;

  select count(*) into n from custody_rules
   where household_id = hid and deleted_at is null and config->>'parent2' = prov::text;
  if n > 0 then raise exception 'ÉCHEC P6c : le rythme désigne encore le provisoire'; end if;

  -- et tout est bien chez le compte réel
  select count(*) into n from custody_exceptions
   where household_id = hid and parent_id = reel and deleted_at is null;
  if n <> 1 then raise exception 'ÉCHEC P6d : % période(s) transférée(s) au lieu d''une', n; end if;

  select count(*) into n from expense_shares s
   join expenses e on e.id = s.expense_id
   where e.household_id = hid and s.parent_id = reel;
  if n <> 1 then raise exception 'ÉCHEC P6e : % part(s) transférée(s) au lieu d''une', n; end if;

  raise notice 'P6 OK — périodes, parts et rythme transférés au compte réel';
end $$;

-- ============ P7 : le provisoire disparaît, le foyer garde deux parents ============
do $$
declare hid uuid := current_setting('app.hid')::uuid; n int;
begin
  select count(*) into n from public.test_comptables(hid);
  if n <> 2 then raise exception 'ÉCHEC P7 : % parents comptables après fusion', n; end if;
  if exists (select 1 from household_members
             where household_id = hid
               and profile_id = current_setting('app.provisoire')::uuid
               and deleted_at is null) then
    raise exception 'ÉCHEC P7b : le profil provisoire est encore membre';
  end if;
  raise notice 'P7 OK — deux parents, le provisoire a cédé sa place';
end $$;

-- ============ P8 : le solde reste juste après la fusion ============
do $$
declare hid uuid := current_setting('app.hid')::uuid; b record;
begin
  -- Tant que le second parent n'a pas rejoint le foyer, aucune dépense ne peut
  -- être validée : le solde reste donc à zéro, ce qui est cohérent. C'est
  -- après son arrivée qu'il valide, et que le solde prend sa valeur.
  select * into b from public.household_balance(hid);
  if b.net_cents <> 0 then
    raise exception 'ÉCHEC P8 : solde de % avant toute validation', b.net_cents;
  end if;

  -- Le second parent, désormais réel, valide la dépense héritée du provisoire
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);
  perform public.review_expense(current_setting('app.depense')::uuid, 'validate');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);

  select * into b from public.household_balance(hid);
  -- Dépense de 40,00 € payée par le premier parent, partagée par moitié :
  -- le second doit 20,00 €. Un transfert incomplet fausserait ce montant.
  if abs(b.net_cents) <> 2000 then
    raise exception 'ÉCHEC P8b : solde de % centimes au lieu de 2000', b.net_cents;
  end if;
  if b.membres_comptables <> 2 then
    raise exception 'ÉCHEC P8b : % membres comptables', b.membres_comptables;
  end if;
  raise notice 'P8 OK — solde exact après fusion : % centimes', abs(b.net_cents);
end $$;

-- ============ P9 : un foyer déjà complet refuse un parent provisoire ============
do $$
begin
  begin
    perform public.nommer_second_parent(current_setting('app.hid')::uuid, 'Troisième');
    raise exception 'ÉCHEC P9 : un troisième parent a été nommé';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%déjà deux parents%' then
      raise exception 'ÉCHEC P9b : motif (%)', sqlerrm;
    end if;
  end;
  raise notice 'P9 OK — pas de troisième parent nommé dans un foyer complet';
end $$;

select 'TESTS DU PARENT PROVISOIRE PASSÉS' as resultat;
