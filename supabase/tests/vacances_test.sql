-- ============================================================
-- TESTS — vacances scolaires automatiques (V1 à V10)
-- ============================================================
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ V1 : choix de la zone ============
do $$
declare z text;
begin
  perform public.set_school_zone('aaaaaaaa-0000-0000-0000-000000000001', 'B');
  select school_zone into z from households where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if z <> 'B' then raise exception 'ÉCHEC V1 : zone % au lieu de B', z; end if;
  if not public.test_audit_existe('school_zone', 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC V1b : changement de zone non journalisé';
  end if;
  raise notice 'V1 OK — zone enregistrée et journalisée';
end $$;

-- ============ V2 : zone invalide refusée ============
do $$
begin
  begin
    perform public.set_school_zone('aaaaaaaa-0000-0000-0000-000000000001', 'D');
    raise exception 'ÉCHEC V2 : zone inexistante acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%A, B ou C%' then raise exception 'ÉCHEC V2b : motif (%)', sqlerrm; end if;
  end;
  raise notice 'V2 OK — seules les zones A, B et C sont acceptées';
end $$;

-- ============ V3 : import du calendrier officiel ============
do $$
declare n int;
begin
  n := public.test_importer_vacances('[
    {"label":"Vacances de la Toussaint","zone":"A","school_year":"2026-2027",
     "starts_on":"2026-10-17","ends_on":"2026-11-02","population":"Élèves"},
    {"label":"Vacances de la Toussaint","zone":"B","school_year":"2026-2027",
     "starts_on":"2026-10-17","ends_on":"2026-11-02","population":"Élèves"},
    {"label":"Vacances de Noël","zone":"B","school_year":"2026-2027",
     "starts_on":"2026-12-19","ends_on":"2027-01-04","population":"Élèves"}
  ]'::jsonb);
  if n <> 3 then raise exception 'ÉCHEC V3 : % périodes importées au lieu de 3', n; end if;
  raise notice 'V3 OK — 3 périodes officielles importées';
end $$;

-- ============ V4 : import idempotent, aucun doublon ============
do $$
declare avant int; apres int;
begin
  select count(*) into avant from school_holidays where source = 'officiel';
  perform public.test_importer_vacances('[
    {"label":"Vacances de Noël","zone":"B","school_year":"2026-2027",
     "starts_on":"2026-12-19","ends_on":"2027-01-04","population":"Élèves"}
  ]'::jsonb);
  select count(*) into apres from school_holidays where source = 'officiel';
  if avant <> apres then
    raise exception 'ÉCHEC V4 : doublon créé (% -> %)', avant, apres;
  end if;
  raise notice 'V4 OK — réimport sans doublon';
end $$;

-- ============ V5 : une date corrigée à la source est mise à jour ============
do $$
declare f date;
begin
  perform public.test_importer_vacances('[
    {"label":"Vacances de Noël","zone":"B","school_year":"2026-2027",
     "starts_on":"2026-12-19","ends_on":"2027-01-05","population":"Élèves"}
  ]'::jsonb);
  select ends_on into f from school_holidays
   where source = 'officiel' and zone = 'B' and label = 'Vacances de Noël'
     and starts_on = '2026-12-19';
  if f <> '2027-01-05' then
    raise exception 'ÉCHEC V5 : fin non actualisée (%)', f;
  end if;
  raise notice 'V5 OK — correction officielle reprise sans doublon';
end $$;

-- ============ V6 : le foyer ne voit que les vacances de SA zone ============
do $$
declare n int;
begin
  select count(*) into n from public.list_school_holidays(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01', '2027-08-31');
  -- zone B : Toussaint + Noël = 2 ; la Toussaint zone A ne doit pas apparaître
  if n <> 2 then raise exception 'ÉCHEC V6 : % périodes visibles au lieu de 2', n; end if;
  if exists (select 1 from public.list_school_holidays(
               'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01', '2027-08-31')
             where zone <> 'B') then
    raise exception 'ÉCHEC V6b : des vacances d''une autre zone sont visibles';
  end if;
  raise notice 'V6 OK — seules les vacances de la zone du foyer sont servies';
end $$;

-- ============ V7 : changer de zone change le calendrier ============
do $$
declare n_b int; n_a int;
begin
  select count(*) into n_b from public.list_school_holidays(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01', '2027-08-31');
  perform public.set_school_zone('aaaaaaaa-0000-0000-0000-000000000001', 'A');
  select count(*) into n_a from public.list_school_holidays(
    'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01', '2027-08-31');
  if n_a = n_b then
    raise exception 'ÉCHEC V7 : le calendrier n''a pas suivi le changement de zone';
  end if;
  raise notice 'V7 OK — zone A : % périodes (contre % en zone B)', n_a, n_b;
end $$;

-- ============ V8 : changer de zone NE TOUCHE PAS aux exceptions parentales ============
do $$
declare eid uuid; avant int; apres int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  select array_length(array_agg(x), 1) into avant from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'holiday',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 3)::timestamptz, (current_date + 10)::timestamptz,
    'Vacances chez Bob', null) x;

  select count(*) into avant from custody_exceptions
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  perform public.set_school_zone('aaaaaaaa-0000-0000-0000-000000000001', 'C');
  perform public.set_school_zone('aaaaaaaa-0000-0000-0000-000000000001', 'B');
  select count(*) into apres from custody_exceptions
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;

  if avant <> apres then
    raise exception 'ÉCHEC V8 : % exceptions avant, % après changement de zone', avant, apres;
  end if;
  raise notice 'V8 OK — les décisions des parents survivent au changement de zone';
end $$;

-- ============ V9 : le client ne peut pas modifier le calendrier national ============
do $$
declare bloques int := 0;
begin
  begin
    perform public.import_school_holidays('[{"label":"Faux","zone":"B",
      "school_year":"2026-2027","starts_on":"2026-01-01","ends_on":"2026-01-10"}]'::jsonb);
  exception when others then bloques := bloques + 1;
  end;
  begin
    insert into school_holidays (label, zone, school_year, starts_on, ends_on, source)
    values ('Faux direct','B','2026-2027','2026-02-01','2026-02-10','officiel');
  exception when others then bloques := bloques + 1;
  end;
  begin
    update school_holidays set ends_on = '2030-01-01' where source = 'officiel';
  exception when others then bloques := bloques + 1;
  end;
  if bloques <> 3 then
    raise exception 'ÉCHEC V9 : le calendrier national est modifiable (%/3 bloqués)', bloques;
  end if;
  raise notice 'V9 OK — calendrier national protégé : ni import, ni écriture directe';
end $$;

-- ============ V10 : état du calendrier, sans rien inventer ============
do $$
declare e record;
begin
  select * into e from public.school_calendar_state('aaaaaaaa-0000-0000-0000-000000000001');
  if e.zone <> 'B' then raise exception 'ÉCHEC V10 : zone rapportée % au lieu de B', e.zone; end if;
  if e.periodes < 1 then raise exception 'ÉCHEC V10b : aucune période rapportée'; end if;
  if e.derniere_date is null then raise exception 'ÉCHEC V10c : dernière date absente'; end if;
  -- Le calendrier de test ne couvre pas un an : l'état doit le dire
  if e.couvre_un_an then
    raise exception 'ÉCHEC V10d : couverture d''un an annoncée à tort';
  end if;
  raise notice 'V10 OK — état exact : zone %, % périodes, couverture annoncée sans exagération',
    e.zone, e.periodes;
end $$;

-- ============ V11 : isolation entre foyers ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
begin
  begin
    perform public.set_school_zone('aaaaaaaa-0000-0000-0000-000000000001', 'A');
    raise exception 'ÉCHEC V11 : un tiers a changé la zone du foyer';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  begin
    perform public.school_calendar_state('aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'ÉCHEC V11b : état du calendrier d''un foyer étranger lisible';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'V11 OK — zone et calendrier isolés par foyer';
end $$;

select 'TESTS DES VACANCES SCOLAIRES PASSÉS' as resultat;
