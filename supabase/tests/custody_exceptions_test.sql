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
