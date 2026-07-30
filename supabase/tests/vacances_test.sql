-- ============================================================
-- TESTS — vacances scolaires automatiques (V1 à V10)
-- ============================================================
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ V1 : choix de la zone ============
do $$
declare z text;
begin
  perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'B');
  select school_zone into z from households where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if z <> 'B' then raise exception 'ÉCHEC V1 : zone % au lieu de B', z; end if;
  if not public.test_audit_existe('household_location', 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC V1b : changement de zone non journalisé';
  end if;
  raise notice 'V1 OK — zone enregistrée et journalisée';
end $$;

-- ============ V2 : zone invalide refusée ============
do $$
begin
  begin
    perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'D');
    raise exception 'ÉCHEC V2 : zone inexistante acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%inconnue%' then raise exception 'ÉCHEC V2b : motif (%)', sqlerrm; end if;
  end;
  raise notice 'V2 OK — seules les zones A, B et C sont acceptées';
end $$;

-- ============ V3 : import du calendrier officiel ============
do $$
declare n int;
begin
  n := public.test_importer_vacances('[
    {"country_code":"FR","label":"Vacances de la Toussaint","zone":"A","school_year":"2026-2027",
     "starts_on":"2026-10-17","ends_on":"2026-11-02","population":"Élèves"},
    {"country_code":"FR","label":"Vacances de la Toussaint","zone":"B","school_year":"2026-2027",
     "starts_on":"2026-10-17","ends_on":"2026-11-02","population":"Élèves"},
    {"country_code":"FR","label":"Vacances de Noël","zone":"B","school_year":"2026-2027",
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
    {"country_code":"FR","label":"Vacances de Noël","zone":"B","school_year":"2026-2027",
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
    {"country_code":"FR","label":"Vacances de Noël","zone":"B","school_year":"2026-2027",
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
  perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'A');
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
  perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'C');
  perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'B');
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
    perform public.import_school_holidays('[{"country_code":"FR","label":"Faux","zone":"B",
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
    perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'A');
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

-- ============================================================
-- L1 à L8 — LOCALISATION MULTI-PAYS
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ L1 : la France est active, d'autres pays sont préparés ============
do $$
declare actifs int; total int;
begin
  select count(*) into actifs from public.pays_disponibles();
  -- La RLS ne montre que les pays actifs : on compte les déclarés autrement.
  select count(*) into total from public.test_pays_declares();
  if actifs < 1 then raise exception 'ÉCHEC L1 : aucun pays actif'; end if;
  if total < 5 then
    raise exception 'ÉCHEC L1b : seulement % pays déclarés, l''architecture doit être extensible', total;
  end if;
  if not exists (select 1 from public.pays_disponibles() where code = 'FR') then
    raise exception 'ÉCHEC L1c : la France n''est pas disponible';
  end if;
  raise notice 'L1 OK — % pays actif(s) sur % déclarés', actifs, total;
end $$;

-- ============ L2 : les trois modes de détermination sont représentés ============
do $$
declare n int;
begin
  select count(distinct mode) into n from public.test_pays_declares();
  if n < 3 then
    raise exception 'ÉCHEC L2 : % mode(s) de zone, l''architecture doit couvrir zone, region et national', n;
  end if;
  raise notice 'L2 OK — les 3 modes de détermination sont pris en charge';
end $$;

-- ============ L3 : ajouter un pays ne demande aucune migration ============
do $$
declare n_avant int; n_apres int;
begin
  select count(*) into n_avant from public.pays_disponibles();
  -- Simule l'activation d'un pays déjà déclaré : une simple ligne de référence
  perform public.test_activer_pays('BE');
  select count(*) into n_apres from public.pays_disponibles();
  if n_apres <> n_avant + 1 then
    raise exception 'ÉCHEC L3 : activer un pays n''a pas suffi (% -> %)', n_avant, n_apres;
  end if;
  perform public.test_desactiver_pays('BE');
  raise notice 'L3 OK — un pays s''active par une ligne, sans changement de schéma';
end $$;

-- ============ L4 : déduction depuis le code postal ============
do $$
declare r record;
begin
  -- La correspondance est vide au départ : on ne devine jamais une zone
  select * into r from public.set_household_location(
    'aaaaaaaa-0000-0000-0000-000000000001', 'FR', null, null, '75001');
  if r.deduite then
    raise exception 'ÉCHEC L4 : une zone a été déduite sans correspondance connue';
  end if;

  -- Après import officiel des correspondances, la déduction fonctionne
  perform public.test_importer_correspondances('FR', '[
    {"area_code":"75","area_label":"Paris","zone_code":"C"},
    {"area_code":"69","area_label":"Rhône","zone_code":"A"}
  ]'::jsonb);
  select * into r from public.set_household_location(
    'aaaaaaaa-0000-0000-0000-000000000001', 'FR', null, null, '75001');
  if not r.deduite or r.zone_retenue <> 'C' then
    raise exception 'ÉCHEC L4b : zone déduite % au lieu de C', r.zone_retenue;
  end if;
  raise notice 'L4 OK — zone déduite du code postal, et jamais devinée sans correspondance';
end $$;

-- ============ L5 : un code postal inconnu ne produit pas de zone ============
do $$
declare r record;
begin
  select * into r from public.set_household_location(
    'aaaaaaaa-0000-0000-0000-000000000001', 'FR', null, null, '33000');
  if r.zone_retenue is not null then
    raise exception 'ÉCHEC L5 : zone % inventée pour un code postal inconnu', r.zone_retenue;
  end if;
  raise notice 'L5 OK — sans correspondance, aucune zone n''est inventée';
end $$;

-- ============ L6 : un pays non pris en charge est refusé ============
do $$
begin
  begin
    perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'ZZ', null);
    raise exception 'ÉCHEC L6 : pays inexistant accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%non pris en charge%' then
      raise exception 'ÉCHEC L6b : motif (%)', sqlerrm;
    end if;
  end;
  raise notice 'L6 OK — pays non déclaré refusé avec un message clair';
end $$;

-- ============ L7 : changer de pays préserve TOUTES les décisions des parents ============
do $$
declare exc_avant int; exc_apres int; remb_avant int; remb_apres int; dep_avant int; dep_apres int;
begin
  perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'B');

  -- Un rythme de garde est mis en place : c'est sa survie qu'on vérifie
  perform public.set_custody_rule('aaaaaaaa-0000-0000-0000-000000000001',
    'alternating_weeks'::custody_pattern, current_date - 7,
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');

  select count(*) into exc_avant from custody_exceptions
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  select count(*) into remb_avant from reimbursements
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  select count(*) into dep_avant from expenses
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;

  -- Trois changements successifs, dont un changement de pays
  perform public.test_activer_pays('LU');
  perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'LU');
  perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'A');
  perform public.set_household_location('aaaaaaaa-0000-0000-0000-000000000001', 'FR', 'B');
  perform public.test_desactiver_pays('LU');

  select count(*) into exc_apres from custody_exceptions
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  select count(*) into remb_apres from reimbursements
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  select count(*) into dep_apres from expenses
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;

  if exc_avant <> exc_apres then
    raise exception 'ÉCHEC L7 : % exceptions avant, % après changement de pays', exc_avant, exc_apres;
  end if;
  if remb_avant <> remb_apres then
    raise exception 'ÉCHEC L7b : remboursements altérés (% -> %)', remb_avant, remb_apres;
  end if;
  if dep_avant <> dep_apres then
    raise exception 'ÉCHEC L7c : dépenses altérées (% -> %)', dep_avant, dep_apres;
  end if;
  if not exists (select 1 from custody_rules
                 where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null) then
    raise exception 'ÉCHEC L7d : le rythme de garde a disparu';
  end if;
  raise notice 'L7 OK — exceptions, dépenses, remboursements et rythme intacts après changement de pays';
end $$;

-- ============ L8 : les vacances scolaires n'attribuent jamais la garde ============
do $$
declare n_avant int; n_apres int;
begin
  -- On importe des vacances qui recouvrent une période de garde existante
  select count(*) into n_avant from custody_exceptions
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  perform public.test_importer_vacances(format('[
    {"country_code":"FR","label":"Vacances de test","zone":"B","school_year":"2026-2027",
     "starts_on":"%s","ends_on":"%s"}]',
     (current_date + 3)::text, (current_date + 10)::text)::jsonb);
  select count(*) into n_apres from custody_exceptions
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;

  if n_avant <> n_apres then
    raise exception 'ÉCHEC L8 : l''import de vacances a modifié les exceptions (% -> %)', n_avant, n_apres;
  end if;
  -- Aucune règle de garde ne doit être créée par un import de vacances
  if exists (select 1 from custody_exceptions
             where household_id = 'aaaaaaaa-0000-0000-0000-000000000001'
               and title = 'Vacances de test') then
    raise exception 'ÉCHEC L8b : une exception de garde a été créée par l''import';
  end if;
  raise notice 'L8 OK — les vacances officielles informent, elles ne décident jamais de la garde';
end $$;

select 'TESTS DE LOCALISATION PASSÉS' as resultat;
