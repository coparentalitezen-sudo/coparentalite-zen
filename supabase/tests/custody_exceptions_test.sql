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
