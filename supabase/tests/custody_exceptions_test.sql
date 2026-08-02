-- ============================================================
-- TESTS — exceptions de garde (E1 à E12)
-- Foyer A : Alice (owner), Bob (parent), Mia (mediator). Enfant : Léa.
-- Foyer B : Carol.
-- ============================================================
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ E1 : ajout d'un changement ponctuel sur un enfant ============
do $$
declare ids uuid[];
begin
  select array_agg(x) into ids from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    '2026-08-10 18:00+02', '2026-08-12 09:00+02',
    'Déplacement professionnel', 'Récupération à la sortie de l''école') x;
  if array_length(ids, 1) <> 1 then
    raise exception 'ÉCHEC E1 : % ligne(s) créée(s) au lieu d''une', array_length(ids, 1);
  end if;
  perform set_config('app.swap', ids[1]::text, false);
  raise notice 'E1 OK — changement ponctuel créé avec horaires précis';
end $$;

-- ============ E2 : les heures sont conservées à la minute ============
do $$
declare e record;
begin
  select * into e from custody_exceptions where id = current_setting('app.swap')::uuid;
  if to_char(e.starts_at at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI') <> '2026-08-10 18:00' then
    raise exception 'ÉCHEC E2 : heure de début altérée (%)',
      to_char(e.starts_at at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI');
  end if;
  if to_char(e.ends_at at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI') <> '2026-08-12 09:00' then
    raise exception 'ÉCHEC E2b : heure de fin altérée';
  end if;
  if e.kind <> 'swap' then raise exception 'ÉCHEC E2c : type incorrect (%)', e.kind; end if;
  if e.title is null or e.note is null then raise exception 'ÉCHEC E2d : titre ou note perdus'; end if;
  raise notice 'E2 OK — dates, heures, type, titre et note conservés';
end $$;

-- ============ E3 : chevauchement refusé au même niveau de priorité ============
do $$
begin
  begin
    perform public.create_custody_exception(
      'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
      array['cccccccc-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-00000000000a',
      '2026-08-11 08:00+02', '2026-08-13 20:00+02', 'Conflit', null);
    raise exception 'ÉCHEC E3 : chevauchement accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%existe déjà%' then
      raise exception 'ÉCHEC E3b : mauvais motif (%)', sqlerrm;
    end if;
  end;
  raise notice 'E3 OK — chevauchement refusé pour le même enfant et le même type';
end $$;

-- ============ E4 : vacances autorisées sur la même période (priorité différente) ============
do $$
declare ids uuid[];
begin
  select array_agg(x) into ids from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'holiday',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000a',
    '2026-08-10 00:00+02', '2026-08-20 00:00+02', 'Vacances d''été', null) x;
  if ids is null then raise exception 'ÉCHEC E4 : vacances refusées'; end if;
  perform set_config('app.holiday', ids[1]::text, false);
  raise notice 'E4 OK — vacances acceptées sur une période déjà couverte par un changement ponctuel';
end $$;

-- ============ E5 : contiguïté autorisée (fin = début) ============
do $$
begin
  perform public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000a',
    '2026-08-12 09:00+02', '2026-08-14 09:00+02', 'Suite immédiate', null);
  raise notice 'E5 OK — deux périodes contiguës acceptées (borne de fin exclue)';
exception when others then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  raise exception 'ÉCHEC E5 : contiguïté refusée à tort (%)', sqlerrm;
end $$;

-- ============ E6 : tous les enfants d'un coup ============
do $$
declare ids uuid[]; n int;
begin
  -- second enfant dans le foyer A
  insert into children (household_id, first_name, created_by)
  values ('aaaaaaaa-0000-0000-0000-000000000001','Noah','00000000-0000-0000-0000-00000000000a');
  select array_agg(x) into ids from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
    (select array_agg(c.id) from children c
      where c.household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and c.deleted_at is null),
    '00000000-0000-0000-0000-00000000000b',
    '2026-09-01 08:00+02', '2026-09-03 18:00+02', 'Rentrée', null) x;
  n := array_length(ids, 1);
  if n <> 2 then raise exception 'ÉCHEC E6 : % ligne(s) au lieu de 2', n; end if;
  raise notice 'E6 OK — une exception par enfant, les deux enfants couverts';
end $$;

-- ============ E7 : enfant d'un autre foyer refusé ============
do $$
begin
  begin
    perform public.create_custody_exception(
      'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
      array['cccccccc-0000-0000-0000-000000000002']::uuid[],
      '00000000-0000-0000-0000-00000000000a',
      '2026-10-01 08:00+02', '2026-10-02 08:00+02', null, null);
    raise exception 'ÉCHEC E7 : enfant étranger accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'E7 OK — enfant extérieur au foyer refusé';
end $$;

-- ============ E8 : parent gardien non comptable refusé ============
do $$
begin
  begin
    perform public.create_custody_exception(
      'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
      array['cccccccc-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-00000000000d',   -- Mia, médiatrice
      '2026-11-01 08:00+02', '2026-11-02 08:00+02', null, null);
    raise exception 'ÉCHEC E8 : la médiatrice a été acceptée comme gardienne';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%parents du foyer%' then
      raise exception 'ÉCHEC E8b : mauvais motif (%)', sqlerrm;
    end if;
  end;
  raise notice 'E8 OK — parent gardien limité aux deux parents du foyer';
end $$;

-- ============ E9 : dates incohérentes refusées ============
do $$
begin
  begin
    perform public.create_custody_exception(
      'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
      array['cccccccc-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-00000000000a',
      '2026-12-05 10:00+01', '2026-12-05 10:00+01', null, null);
    raise exception 'ÉCHEC E9 : période de durée nulle acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'E9 OK — fin antérieure ou égale au début refusée';
end $$;

-- ============ E10 : modification par l'autre parent ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare e record;
begin
  perform public.update_custody_exception(
    current_setting('app.swap')::uuid,
    '00000000-0000-0000-0000-00000000000a',
    '2026-08-10 20:00+02', '2026-08-12 08:00+02',
    'Déplacement reporté', 'Nouvel horaire convenu');
  select * into e from custody_exceptions where id = current_setting('app.swap')::uuid;
  if e.parent_id <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'ÉCHEC E10 : parent gardien non mis à jour';
  end if;
  if to_char(e.starts_at at time zone 'Europe/Paris', 'HH24:MI') <> '20:00' then
    raise exception 'ÉCHEC E10b : horaire non mis à jour';
  end if;
  if e.title <> 'Déplacement reporté' then raise exception 'ÉCHEC E10c : titre non mis à jour'; end if;
  raise notice 'E10 OK — modification possible par l''autre parent, horaires et titre mis à jour';

  -- la contrainte protège aussi les modifications
  begin
    perform public.update_custody_exception(
      current_setting('app.swap')::uuid,
      '00000000-0000-0000-0000-00000000000a',
      '2026-08-10 20:00+02', '2026-08-13 12:00+02', null, null);
    raise exception 'ÉCHEC E10d : modification chevauchante acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%chevauchent%' then raise exception 'ÉCHEC E10e : motif (%)', sqlerrm; end if;
  end;
  raise notice 'E10 OK — modification chevauchante refusée avec un message clair';
end $$;

-- ============ E11 : lecture par les deux parents, invisible pour un tiers ============
do $$
declare n_bob int; n_alice int; n_carol int;
begin
  select count(*) into n_bob from public.list_custody_exceptions(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-08-01', '2026-09-30');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  select count(*) into n_alice from public.list_custody_exceptions(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-08-01', '2026-09-30');
  if n_bob <> n_alice or n_bob = 0 then
    raise exception 'ÉCHEC E11 : lectures divergentes (Bob % / Alice %)', n_bob, n_alice;
  end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
  select count(*) into n_carol from public.list_custody_exceptions(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-08-01', '2026-09-30');
  if n_carol <> 0 then
    raise exception 'ÉCHEC E11b : un foyer étranger lit % exception(s)', n_carol;
  end if;
  if exists (select 1 from custody_exceptions
             where household_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC E11c : lecture directe possible depuis un autre foyer';
  end if;
  raise notice 'E11 OK — visibles par les deux parents (% chacun), invisibles ailleurs', n_alice;
end $$;

-- ============ E12 : suppression logique, non rejouable, tracée ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare cible uuid := current_setting('app.swap')::uuid;
begin
  perform public.delete_custody_exception(cible);
  if exists (select 1 from custody_exceptions ce where ce.id = cible and ce.deleted_at is null) then
    raise exception 'ÉCHEC E12 : la période est toujours active';
  end if;
  if not public.test_audit_existe('custody_exception', cible) then
    raise exception 'ÉCHEC E12b : suppression non journalisée';
  end if;
  begin
    perform public.delete_custody_exception(cible);
    raise exception 'ÉCHEC E12c : suppression rejouable';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  -- la place se libère : on peut recréer sur les mêmes dates
  perform public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    '2026-08-10 18:00+02', '2026-08-12 09:00+02', 'Nouvelle période', null);
  raise notice 'E12 OK — suppression logique tracée, non rejouable, créneau libéré';
end $$;

-- ============ E13 : écriture directe refusée ============
do $$
begin
  begin
    insert into custody_exceptions (household_id, child_id, parent_id, kind, starts_at, ends_at, created_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-00000000000a','swap','2027-01-01','2027-01-02',
            '00000000-0000-0000-0000-00000000000a');
    raise exception 'ÉCHEC E13 : écriture directe acceptée';
  exception when insufficient_privilege then null;
    when others then if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'E13 OK — écriture directe refusée, tout passe par les fonctions serveur';
end $$;

select 'TESTS DES EXCEPTIONS DE GARDE PASSÉS' as resultat;

-- ============================================================
-- M1 à M7 — MOTEUR GÉNÉRIQUE D'EXCEPTIONS
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ M1 : le catalogue est lisible et ordonné ============
do $$
declare n int; p_min smallint; p_max smallint;
begin
  select count(*) into n from public.types_exception();
  if n < 5 then raise exception 'ÉCHEC M1 : % types au lieu de 5 attendus', n; end if;
  select min(priorite), max(priorite) into p_min, p_max from public.types_exception();
  if p_min >= p_max then raise exception 'ÉCHEC M1b : les priorités ne départagent rien'; end if;
  raise notice 'M1 OK — % types, priorités de % à %', n, p_min, p_max;
end $$;

-- ============ M2 : ajouter un type ne demande aucune migration ============
do $$
declare avant int; apres int; eid uuid;
begin
  select count(*) into avant from public.types_exception();
  perform public.test_ajouter_type_exception('stage', 'Stage sportif', 25::smallint);
  select count(*) into apres from public.types_exception();
  if apres <> avant + 1 then
    raise exception 'ÉCHEC M2 : le type n''a pas été pris en compte (% -> %)', avant, apres;
  end if;

  -- et il est immédiatement utilisable
  select x into eid from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'stage',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 40)::timestamptz, (current_date + 45)::timestamptz,
    'Stage de judo', null, null, null) x;
  if eid is null then raise exception 'ÉCHEC M2b : type inutilisable après création'; end if;
  raise notice 'M2 OK — un type inédit s''ajoute et s''utilise sans migration';
end $$;

-- ============ M3 : un type inconnu est refusé ============
do $$
begin
  begin
    perform public.create_custody_exception(
      'aaaaaaaa-0000-0000-0000-000000000001', 'inexistant',
      array['cccccccc-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-00000000000b',
      (current_date + 60)::timestamptz, (current_date + 61)::timestamptz, null, null, null, null);
    raise exception 'ÉCHEC M3 : type inconnu accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%inconnu%' then raise exception 'ÉCHEC M3b : motif (%)', sqlerrm; end if;
  end;
  raise notice 'M3 OK — seul un type du catalogue est accepté';
end $$;

-- ============ M4 : deux types différents peuvent se recouvrir ============
do $$
declare a uuid; b uuid;
begin
  select x into a from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'travel',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000a',
    (current_date + 70)::timestamptz, (current_date + 75)::timestamptz, 'Voyage', null, null, null) x;
  select x into b from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'absence',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 72)::timestamptz, (current_date + 74)::timestamptz, 'Imprévu', null, null, null) x;
  if a is null or b is null then
    raise exception 'ÉCHEC M4 : deux types différents devraient pouvoir coexister';
  end if;
  raise notice 'M4 OK — types différents superposables, la priorité tranchera';
end $$;

-- ============ M5 : le même type ne peut pas se recouvrir ============
do $$
begin
  begin
    perform public.create_custody_exception(
      'aaaaaaaa-0000-0000-0000-000000000001', 'travel',
      array['cccccccc-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-00000000000b',
      (current_date + 71)::timestamptz, (current_date + 73)::timestamptz, 'Second voyage', null, null, null);
    raise exception 'ÉCHEC M5 : deux voyages simultanés acceptés';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%existe déjà%' then raise exception 'ÉCHEC M5b : motif (%)', sqlerrm; end if;
  end;
  raise notice 'M5 OK — recouvrement du même type refusé, avec un message clair';
end $$;

-- ============ M6 : la lecture rapporte priorité et habillage ============
do $$
declare e record; sans_priorite int;
begin
  select count(*) into sans_priorite from public.list_custody_exceptions(
    'aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date + 200)
   where priorite is null or kind_label is null;
  if sans_priorite > 0 then
    raise exception 'ÉCHEC M6 : % exception(s) sans priorité ni libellé', sans_priorite;
  end if;
  -- les exceptions arrivent triées par priorité croissante : le client peut
  -- les appliquer dans l'ordre reçu
  select * into e from public.list_custody_exceptions(
    'aaaaaaaa-0000-0000-0000-000000000001', current_date - 30, current_date + 200) limit 1;
  raise notice 'M6 OK — priorité et libellé fournis (première : % priorité %)', e.kind_label, e.priorite;
end $$;

-- ============ M7 : les vacances se rattachent à leur période officielle ============
do $$
declare hid uuid; eid uuid; n int;
begin
  perform public.test_importer_vacances(format('[
    {"country_code":"FR","label":"Vacances de test M7","zone":"B","school_year":"2026-2027",
     "starts_on":"%s","ends_on":"%s"}]',
     (current_date + 55)::text, (current_date + 65)::text)::jsonb);
  select id into hid from school_holidays
   where label = 'Vacances de test M7' and source = 'officiel' limit 1;

  select x into eid from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'holiday',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000a',
    (current_date + 56)::timestamptz, (current_date + 63)::timestamptz,
    'Vacances de test M7', null, '2026-2027', hid) x;

  select count(*) into n from custody_exceptions
   where id = eid and source_holiday_id = hid and school_year = '2026-2027';
  if n <> 1 then raise exception 'ÉCHEC M7 : rattachement à la période officielle perdu'; end if;
  raise notice 'M7 OK — décision rattachée à sa période officielle, dates librement ajustées';
end $$;

select 'TESTS DU MOTEUR D''EXCEPTIONS PASSÉS' as resultat;

-- ============================================================
-- R1 à R4 — RYTHMES DE GARDE
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ R1 : le rythme 3-4-4-3 est disponible ============
do $$
declare rid uuid;
begin
  rid := public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
    'p3443'::custody_pattern, current_date - 7,
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
  if rid is null then raise exception 'ÉCHEC R1 : rythme 3-4-4-3 refusé'; end if;
  raise notice 'R1 OK — rythme 3-4-4-3 enregistré';
end $$;

-- ============ R2 : un cycle personnalisé est conservé ============
do $$
declare cfg jsonb;
begin
  perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
    'custom'::custody_pattern, current_date - 7,
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
    null, null,
    '["P2","P2","P1","P1","P1","P1","P1","P2","P2","P1","P1","P1","P1","P1"]'::jsonb);

  select config into cfg from custody_rules
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  if cfg->'custom_cycle' is null then
    raise exception 'ÉCHEC R2 : le cycle personnalisé n''a pas été conservé';
  end if;
  if jsonb_array_length(cfg->'custom_cycle') <> 14 then
    raise exception 'ÉCHEC R2b : cycle de % jours au lieu de 14',
      jsonb_array_length(cfg->'custom_cycle');
  end if;
  raise notice 'R2 OK — cycle personnalisé de 14 jours conservé';
end $$;

-- ============ R3 : un cycle invalide est refusé ============
do $$
declare bloques int := 0;
begin
  -- cycle vide
  begin
    perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
      'custom'::custody_pattern, current_date, '00000000-0000-0000-0000-00000000000a',
      '00000000-0000-0000-0000-00000000000b', null, null, null);
  exception when others then bloques := bloques + 1;
  end;
  -- semaines incomplètes
  begin
    perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
      'custom'::custody_pattern, current_date, '00000000-0000-0000-0000-00000000000a',
      '00000000-0000-0000-0000-00000000000b', null, null,
      '["P1","P1","P2"]'::jsonb);
  exception when others then bloques := bloques + 1;
  end;
  -- un parent privé de toute garde
  begin
    perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
      'custom'::custody_pattern, current_date, '00000000-0000-0000-0000-00000000000a',
      '00000000-0000-0000-0000-00000000000b', null, null,
      '["P1","P1","P1","P1","P1","P1","P1"]'::jsonb);
  exception when others then bloques := bloques + 1;
  end;
  -- plus de quatre semaines
  begin
    perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
      'custom'::custody_pattern, current_date, '00000000-0000-0000-0000-00000000000a',
      '00000000-0000-0000-0000-00000000000b', null, null,
      (select jsonb_agg('P1') from generate_series(1, 35)));
  exception when others then bloques := bloques + 1;
  end;

  if bloques <> 4 then
    raise exception 'ÉCHEC R3 : %/4 cycles invalides refusés', bloques;
  end if;
  raise notice 'R3 OK — cycle vide, incomplet, exclusif ou trop long : tous refusés';
end $$;

-- ============ R4 : les rythmes classiques n'exigent aucun cycle ============
do $$
declare rid uuid;
begin
  rid := public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
    'alternating_weeks'::custody_pattern, current_date - 7,
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
  if rid is null then raise exception 'ÉCHEC R4 : rythme classique refusé'; end if;
  raise notice 'R4 OK — les rythmes prédéfinis restent utilisables sans cycle';
end $$;

-- ============ R5 : le jour du changement est enregistré ============
do $$
declare jour smallint;
begin
  perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
    'alternating_weeks'::custody_pattern, current_date - 7,
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
    null, null, null, 5::smallint);

  select handover_day into jour from custody_rules
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  if jour is distinct from 5 then
    raise exception 'ÉCHEC R5 : jour du changement % au lieu de 5 (vendredi)', jour;
  end if;
  raise notice 'R5 OK — changement le vendredi conservé';
end $$;

-- ============ R6 : un jour hors semaine est refusé ============
do $$
declare bloques int := 0;
begin
  begin
    perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
      'alternating_weeks'::custody_pattern, current_date,
      '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
      null, null, null, 7::smallint);
  exception when others then bloques := bloques + 1;
  end;
  begin
    perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
      'alternating_weeks'::custody_pattern, current_date,
      '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
      null, null, null, (-1)::smallint);
  exception when others then bloques := bloques + 1;
  end;
  if bloques <> 2 then
    raise exception 'ÉCHEC R6 : %/2 jours invalides refusés', bloques;
  end if;
  raise notice 'R6 OK — les jours hors semaine sont refusés';
end $$;

-- ============ R7 : sans précision, aucun jour n'est imposé ============
do $$
declare jour smallint;
begin
  perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
    'alternating_weeks'::custody_pattern, current_date - 7,
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
  select handover_day into jour from custody_rules
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  if jour is not null then
    raise exception 'ÉCHEC R7 : jour % imposé alors qu''aucun n''était demandé', jour;
  end if;
  raise notice 'R7 OK — les règles sans jour précisé restent au lundi';
end $$;

select 'TESTS DES RYTHMES PASSÉS' as resultat;

-- ============================================================
-- V1 à V6 — PROPOSITIONS DE VACANCES
--
-- Ces tests existent parce que la fonction a été livrée sans jamais avoir été
-- exécutée : elle employait min() sur un uuid, ce que PostgreSQL ne définit
-- pas, et l'écran Vacances échouait entièrement.
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ V1 : la fonction s'exécute et renvoie les périodes ============
do $$
declare n int;
begin
  perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'B');
  perform public.test_importer_vacances(format('[
    {"country_code":"FR","label":"Toussaint","zone":"B","school_year":"%s",
     "starts_on":"%s","ends_on":"%s"},
    {"country_code":"FR","label":"Noël","zone":"B","school_year":"%s",
     "starts_on":"%s","ends_on":"%s"}]',
     public.test_annee_scolaire(), (current_date + 20)::text, (current_date + 30)::text,
     public.test_annee_scolaire(), (current_date + 50)::text, (current_date + 60)::text)::jsonb);

  select count(*) into n from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001');
  if n < 2 then raise exception 'ÉCHEC V1 : % proposition(s) au lieu de 2 au moins', n; end if;
  raise notice 'V1 OK — % propositions renvoyées', n;
end $$;

-- ============ V2 : sans décision, les champs de décision sont vides ============
do $$
declare p record;
begin
  select * into p from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint';
  if p.exception_id is not null then
    raise exception 'ÉCHEC V2 : une décision est signalée alors qu''aucune n''existe';
  end if;
  if p.debut_officiel is null or p.fin_officielle is null then
    raise exception 'ÉCHEC V2b : dates officielles absentes';
  end if;
  if p.enfants_couverts <> 0 then
    raise exception 'ÉCHEC V2c : % enfant(s) couvert(s) sans décision', p.enfants_couverts;
  end if;
  raise notice 'V2 OK — période non décidée : dates officielles seules';
end $$;

-- ============ V3 : une décision est rapportée avec ses dates ajustées ============
do $$
declare hid uuid; p record; eid uuid;
begin
  select holiday_id into hid from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint';

  -- Les parents retiennent des dates différentes des officielles
  select x into eid from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'holiday',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 22)::timestamptz, (current_date + 28)::timestamptz,
    'Toussaint', null, public.test_annee_scolaire(), hid) x;

  select * into p from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint';
  if p.exception_id <> eid then
    raise exception 'ÉCHEC V3 : décision non rattachée à sa période';
  end if;
  if p.parent_id <> '00000000-0000-0000-0000-00000000000b' then
    raise exception 'ÉCHEC V3b : parent gardien incorrect';
  end if;
  if p.debut_retenu::date <> (current_date + 22) then
    raise exception 'ÉCHEC V3c : date retenue % au lieu de %', p.debut_retenu::date, current_date + 22;
  end if;
  if p.enfants_couverts <> 1 then
    raise exception 'ÉCHEC V3d : % enfant(s) couvert(s) au lieu de 1', p.enfants_couverts;
  end if;
  raise notice 'V3 OK — décision rapportée, dates ajustées conservées';
end $$;

-- ============ V4 : le total d'enfants du foyer est exact ============
do $$
declare p record; n int;
begin
  select count(*) into n from children
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  select * into p from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001') limit 1;
  if p.enfants_total <> n then
    raise exception 'ÉCHEC V4 : % enfants annoncés au lieu de %', p.enfants_total, n;
  end if;
  raise notice 'V4 OK — % enfants du foyer', p.enfants_total;
end $$;

-- ============ V5 : seules les vacances de la zone du foyer remontent ============
do $$
declare n int;
begin
  perform public.test_importer_vacances(format('[
    {"country_code":"FR","label":"Hiver zone A","zone":"A","school_year":"%s",
     "starts_on":"%s","ends_on":"%s"}]',
     public.test_annee_scolaire(), (current_date + 70)::text, (current_date + 80)::text)::jsonb);
  select count(*) into n from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Hiver zone A';
  if n <> 0 then
    raise exception 'ÉCHEC V5 : une période d''une autre zone est proposée';
  end if;
  raise notice 'V5 OK — seules les périodes de la zone du foyer sont proposées';
end $$;

-- ============ V6 : un foyer étranger n'accède à rien ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
begin
  begin
    perform public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'ÉCHEC V6 : propositions accessibles depuis un autre foyer';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'V6 OK — propositions isolées par foyer';
end $$;

select 'TESTS DES PROPOSITIONS DE VACANCES PASSÉS' as resultat;

-- ============================================================
-- S1 à S5 — PARTAGE D'UNE PÉRIODE DE VACANCES
--
-- Le partage est le cas normal : huit jours chez l'un, huit chez l'autre.
-- Une seule décision par période rendait le planning faux — la période entière
-- s'affichait au nom du premier parent.
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ S1 : une période sans décision apparaît une fois ============
do $$
declare hid uuid; n int; p record;
begin
  perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'B');
  perform public.test_importer_vacances(format('[
    {"country_code":"FR","label":"Toussaint S","zone":"B","school_year":"%s",
     "starts_on":"%s","ends_on":"%s"}]',
     public.test_annee_scolaire(), (current_date + 40)::text, (current_date + 56)::text)::jsonb);

  select count(*) into n from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint S';
  if n <> 1 then raise exception 'ÉCHEC S1 : % ligne(s) pour une période non décidée', n; end if;

  select * into p from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint S';
  if p.segments_total <> 0 then
    raise exception 'ÉCHEC S1b : % segment(s) annoncé(s) sans décision', p.segments_total;
  end if;
  perform set_config('app.hid_s', p.holiday_id::text, false);
  raise notice 'S1 OK — période libre : une seule ligne, aucun segment';
end $$;

-- ============ S2 : deux segments, deux parents, deux lignes ============
do $$
declare n int;
begin
  -- Première moitié chez le premier parent
  perform public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'holiday',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000a',
    (current_date + 40)::timestamptz, (current_date + 47)::timestamptz,
    'Toussaint S', null, public.test_annee_scolaire(),
    current_setting('app.hid_s')::uuid);

  -- Seconde moitié chez l'autre
  perform public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'holiday',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 48)::timestamptz, (current_date + 56)::timestamptz,
    'Toussaint S', null, public.test_annee_scolaire(),
    current_setting('app.hid_s')::uuid);

  select count(*) into n from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint S';
  if n <> 2 then
    raise exception 'ÉCHEC S2 : % ligne(s) pour deux segments — la période est agrégée', n;
  end if;
  raise notice 'S2 OK — deux segments, deux lignes distinctes';
end $$;

-- ============ S3 : chaque segment garde SON parent et SES dates ============
do $$
declare premier record; second record;
begin
  select * into premier from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint S' and segment = 1;
  select * into second from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint S' and segment = 2;

  if premier.parent_id = second.parent_id then
    raise exception 'ÉCHEC S3 : les deux segments désignent le même parent';
  end if;
  if premier.parent_id <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'ÉCHEC S3b : premier segment attribué au mauvais parent';
  end if;
  if premier.fin_retenue >= second.debut_retenu then
    raise exception 'ÉCHEC S3c : les segments se recouvrent';
  end if;
  if premier.segments_total <> 2 or second.segments_total <> 2 then
    raise exception 'ÉCHEC S3d : le nombre total de segments est incorrect';
  end if;
  raise notice 'S3 OK — segment 1 chez le premier parent, segment 2 chez le second';
end $$;

-- ============ S4 : le chevauchement reste refusé ============
do $$
begin
  begin
    perform public.create_custody_exception(
      'aaaaaaaa-0000-0000-0000-000000000001', 'holiday',
      array['cccccccc-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-00000000000a',
      (current_date + 45)::timestamptz, (current_date + 50)::timestamptz,
      'Toussaint S', null, public.test_annee_scolaire(),
      current_setting('app.hid_s')::uuid);
    raise exception 'ÉCHEC S4 : un segment chevauchant a été accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%existe déjà%' then
      raise exception 'ÉCHEC S4b : motif inattendu (%)', sqlerrm;
    end if;
  end;
  raise notice 'S4 OK — deux segments ne peuvent pas se recouvrir';
end $$;

-- ============ S5 : trois segments restent possibles ============
do $$
declare n int;
begin
  -- Rien n'impose de couper en deux : certaines familles alternent par semaine
  perform public.test_importer_vacances(format('[
    {"country_code":"FR","label":"Ete S","zone":"B","school_year":"%s",
     "starts_on":"%s","ends_on":"%s"}]',
     public.test_annee_scolaire(), (current_date + 60)::text, (current_date + 82)::text)::jsonb);

  perform public.test_segmenter_vacances('aaaaaaaa-0000-0000-0000-000000000001', 'Ete S');

  select count(*) into n from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Ete S';
  if n <> 3 then raise exception 'ÉCHEC S5 : % segment(s) au lieu de 3', n; end if;
  raise notice 'S5 OK — un découpage en trois segments est possible';
end $$;

select 'TESTS DU PARTAGE DES VACANCES PASSÉS' as resultat;

-- ============================================================
-- SU1 à SU4 — RETRAIT D'UN SEGMENT
--
-- Un segment regroupe une exception par enfant. Le retrait doit les emporter
-- toutes : n'en supprimer qu'une laissait le segment à moitié effacé, et donc
-- impossible à corriger après une saisie erronée.
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ SU1 : le segment entier disparaît ============
do $$
declare hid uuid; eid uuid; n int; enfants uuid[];
begin
  -- Deux enfants dans le foyer, pour éprouver le cas qui échouait
  select array_agg(id) into enfants from children
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;

  -- Les suites précédentes occupent le calendrier : on libère la fenêtre,
  -- ces tests ne portant pas sur le chevauchement.
  perform public.test_liberer_fenetre('aaaaaaaa-0000-0000-0000-000000000001',
    (current_date + 24)::date, (current_date + 36)::date);

  perform public.test_importer_vacances(format('[
    {"country_code":"FR","label":"Toussaint SU","zone":"B","school_year":"%s",
     "starts_on":"%s","ends_on":"%s"}]',
     public.test_annee_scolaire(), (current_date + 25)::text, (current_date + 35)::text)::jsonb);
  select id into hid from school_holidays
   where label = 'Toussaint SU' and source = 'officiel' limit 1;

  select x into eid from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'holiday', enfants,
    '00000000-0000-0000-0000-00000000000a',
    (current_date + 26)::timestamptz, (current_date + 30)::timestamptz,
    'Toussaint SU', null, public.test_annee_scolaire(), hid) x;

  n := public.supprimer_segment_vacances(eid);
  if n < array_length(enfants, 1) then
    raise exception 'ÉCHEC SU1 : % exception(s) retirée(s) pour % enfant(s)',
      n, array_length(enfants, 1);
  end if;

  select count(*) into n from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint SU' and exception_id is not null;
  if n <> 0 then
    raise exception 'ÉCHEC SU1b : % segment(s) subsistent après retrait', n;
  end if;
  raise notice 'SU1 OK — segment entier retiré, tous enfants compris';
end $$;

-- ============ SU2 : la période redevient libre ============
do $$
declare p record;
begin
  select * into p from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint SU';
  if p.holiday_id is null then
    raise exception 'ÉCHEC SU2 : la période a disparu au lieu de redevenir libre';
  end if;
  if p.exception_id is not null then
    raise exception 'ÉCHEC SU2b : une décision subsiste';
  end if;
  if p.segments_total <> 0 then
    raise exception 'ÉCHEC SU2c : % segment(s) annoncé(s)', p.segments_total;
  end if;
  raise notice 'SU2 OK — la période réapparaît avec ses dates officielles';
end $$;

-- ============ SU3 : les segments voisins sont préservés ============
do $$
declare hid uuid; e1 uuid; e2 uuid; n int; enfants uuid[];
begin
  select array_agg(id) into enfants from children
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  select id into hid from school_holidays
   where label = 'Toussaint SU' and source = 'officiel' limit 1;

  select x into e1 from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'holiday', enfants,
    '00000000-0000-0000-0000-00000000000a',
    (current_date + 25)::timestamptz, (current_date + 29)::timestamptz,
    'Toussaint SU', null, public.test_annee_scolaire(), hid) x;
  select x into e2 from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'holiday', enfants,
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 30)::timestamptz, (current_date + 35)::timestamptz,
    'Toussaint SU', null, public.test_annee_scolaire(), hid) x;

  perform public.supprimer_segment_vacances(e1);

  select count(*) into n from public.propositions_vacances('aaaaaaaa-0000-0000-0000-000000000001')
   where libelle = 'Toussaint SU' and exception_id is not null;
  if n <> 1 then
    raise exception 'ÉCHEC SU3 : % segment(s) restant(s) au lieu d''un — le voisin a été emporté', n;
  end if;
  raise notice 'SU3 OK — seul le segment visé est retiré';
end $$;

-- ============ SU4 : un tiers ne peut rien retirer ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
declare eid uuid;
begin
  select exception_id into eid from public.test_segment_quelconque(
    'aaaaaaaa-0000-0000-0000-000000000001', 'Toussaint SU');
  begin
    perform public.supprimer_segment_vacances(eid);
    raise exception 'ÉCHEC SU4 : un tiers a retiré une période';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'SU4 OK — le retrait reste réservé aux membres du foyer';
end $$;

select 'TESTS DU RETRAIT DE SEGMENT PASSÉS' as resultat;
