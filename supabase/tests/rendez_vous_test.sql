-- ============================================================
-- TESTS — rendez-vous et affaires à prévoir (R1 à R10)
-- ============================================================
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ R1 : créer un rendez-vous ============
do $$
declare rid uuid;
begin
  rid := public.create_appointment(
    'aaaaaaaa-0000-0000-0000-000000000001', 'sante', 'Dentiste',
    (current_date + 3 + time '14:30')::timestamptz,
    (current_date + 3 + time '15:15')::timestamptz,
    false, 'Cabinet Rousseau', 'Contrôle annuel',
    '00000000-0000-0000-0000-00000000000b',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    array['Carte Vitale', 'Carnet de santé']);
  if rid is null then raise exception 'ÉCHEC R1 : aucun rendez-vous créé'; end if;
  perform set_config('app.rdv', rid::text, false);
  raise notice 'R1 OK — rendez-vous créé avec ses affaires';
end $$;

-- ============ R2 : UN RENDEZ-VOUS NE CHANGE JAMAIS LA GARDE ============
do $$
declare avant int; apres int; regle_avant uuid; regle_apres uuid;
begin
  -- C'est la propriété essentielle : noter une consultation ne doit pas
  -- déplacer un enfant d'un parent à l'autre.
  select count(*) into avant from custody_exceptions
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  select id into regle_avant from custody_rules
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;

  perform public.create_appointment(
    'aaaaaaaa-0000-0000-0000-000000000001', 'ecole', 'Réunion parents-professeurs',
    (current_date + 5 + time '18:00')::timestamptz, null, false, 'École', null,
    null, array['cccccccc-0000-0000-0000-000000000001']::uuid[], null);

  select count(*) into apres from custody_exceptions
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  select id into regle_apres from custody_rules
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;

  if avant <> apres then
    raise exception 'ÉCHEC R2 : un rendez-vous a créé % période(s) de garde', apres - avant;
  end if;
  if regle_avant is distinct from regle_apres then
    raise exception 'ÉCHEC R2b : le rythme de garde a été modifié';
  end if;
  raise notice 'R2 OK — le planning de garde est intact : un rendez-vous informe, il ne décide pas';
end $$;

-- ============ R3 : le rendez-vous est lisible avec son contenu ============
do $$
declare r record;
begin
  select * into r from public.list_appointments(
    'aaaaaaaa-0000-0000-0000-000000000001', current_date, current_date + 30)
   where titre = 'Dentiste';
  if r.id is null then raise exception 'ÉCHEC R3 : rendez-vous introuvable'; end if;
  if r.categorie_label is null then raise exception 'ÉCHEC R3b : catégorie non résolue'; end if;
  if r.enfants is null then raise exception 'ÉCHEC R3c : aucun enfant rattaché'; end if;
  if r.lieu <> 'Cabinet Rousseau' then raise exception 'ÉCHEC R3d : lieu perdu'; end if;
  if r.accompagnant_nom is null then raise exception 'ÉCHEC R3e : accompagnant non résolu'; end if;
  if r.affaires_total <> 2 then
    raise exception 'ÉCHEC R3f : % affaire(s) au lieu de 2', r.affaires_total;
  end if;
  raise notice 'R3 OK — « % » chez % avec % affaires', r.titre, r.accompagnant_nom, r.affaires_total;
end $$;

-- ============ R4 : l'autre parent est notifié, jamais l'auteur ============
do $$
declare a int; b int;
begin
  a := public.test_compter_notifs('00000000-0000-0000-0000-00000000000a', 'appointment_created');
  b := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'appointment_created');
  if a <> 0 then raise exception 'ÉCHEC R4 : l''auteur a été notifié'; end if;
  if b < 2 then raise exception 'ÉCHEC R4b : % notification(s) pour l''autre parent', b; end if;
  raise notice 'R4 OK — % notifications pour l''autre parent, aucune pour l''auteur', b;
end $$;

-- ============ R5 : la notification porte l'essentiel ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare n record;
begin
  select * into n from public.mes_notifications('aaaaaaaa-0000-0000-0000-000000000001', 20)
   where type_code = 'appointment_created' and titre = 'Dentiste' limit 1;
  if n.id is null then raise exception 'ÉCHEC R5 : notification absente'; end if;
  if n.corps not like '%Cabinet Rousseau%' then
    raise exception 'ÉCHEC R5b : le lieu n''est pas rappelé (%)', n.corps;
  end if;
  if n.corps not like '%14h%' then
    raise exception 'ÉCHEC R5c : l''heure n''est pas rappelée (%)', n.corps;
  end if;
  raise notice 'R5 OK — « % » · %', n.titre, n.corps;
end $$;

-- ============ R6 : cocher une affaire ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare pid uuid; r record;
begin
  select id into pid from packing_items
   where appointment_id = current_setting('app.rdv')::uuid and deleted_at is null limit 1;
  perform public.cocher_affaire(pid, true);

  select * into r from public.list_appointments(
    'aaaaaaaa-0000-0000-0000-000000000001', current_date, current_date + 30)
   where titre = 'Dentiste';
  if r.affaires_cochees <> 1 then
    raise exception 'ÉCHEC R6 : % affaire(s) cochée(s) au lieu d''une', r.affaires_cochees;
  end if;
  raise notice 'R6 OK — % affaire sur % préparée', r.affaires_cochees, r.affaires_total;
end $$;

-- ============ R7 : affaires récurrentes par jour de semaine ============
do $$
declare n int;
begin
  -- « Le lundi, ne pas oublier le sac de piscine. »
  perform public.ajouter_affaire('aaaaaaaa-0000-0000-0000-000000000001',
    'Sac de piscine', null, 1::smallint, 'cccccccc-0000-0000-0000-000000000001');
  select count(*) into n from public.affaires_recurrentes('aaaaaaaa-0000-0000-0000-000000000001');
  if n <> 1 then raise exception 'ÉCHEC R7 : % affaire récurrente au lieu d''une', n; end if;
  raise notice 'R7 OK — affaire récurrente enregistrée pour le lundi';
end $$;

-- ============ R8 : une affaire doit être rattachée, mais à une seule chose ============
do $$
declare bloques int := 0;
begin
  -- ni rendez-vous ni jour
  begin
    perform public.ajouter_affaire('aaaaaaaa-0000-0000-0000-000000000001', 'Orpheline');
  exception when others then bloques := bloques + 1;
  end;
  -- les deux à la fois
  begin
    perform public.ajouter_affaire('aaaaaaaa-0000-0000-0000-000000000001', 'Ambiguë',
      current_setting('app.rdv')::uuid, 3::smallint);
  exception when others then bloques := bloques + 1;
  end;
  if bloques <> 2 then
    raise exception 'ÉCHEC R8 : %/2 rattachements incohérents refusés', bloques;
  end if;
  raise notice 'R8 OK — une affaire se rattache à un rendez-vous ou à un jour, jamais aux deux';
end $$;

-- ============ R9 : contrôles de saisie ============
do $$
declare bloques int := 0;
begin
  -- intitulé vide
  begin
    perform public.create_appointment('aaaaaaaa-0000-0000-0000-000000000001', 'sante', '   ',
      (current_date + 1)::timestamptz, null, false, null, null, null,
      array['cccccccc-0000-0000-0000-000000000001']::uuid[], null);
  exception when others then bloques := bloques + 1;
  end;
  -- fin avant début
  begin
    perform public.create_appointment('aaaaaaaa-0000-0000-0000-000000000001', 'sante', 'Incohérent',
      (current_date + 3)::timestamptz, (current_date + 1)::timestamptz, false, null, null, null,
      array['cccccccc-0000-0000-0000-000000000001']::uuid[], null);
  exception when others then bloques := bloques + 1;
  end;
  -- aucun enfant
  begin
    perform public.create_appointment('aaaaaaaa-0000-0000-0000-000000000001', 'sante', 'Sans enfant',
      (current_date + 1)::timestamptz, null, false, null, null, null, null, null);
  exception when others then bloques := bloques + 1;
  end;
  -- accompagnant étranger au foyer
  begin
    perform public.create_appointment('aaaaaaaa-0000-0000-0000-000000000001', 'sante', 'Étranger',
      (current_date + 1)::timestamptz, null, false, null, null,
      '00000000-0000-0000-0000-00000000000c',
      array['cccccccc-0000-0000-0000-000000000001']::uuid[], null);
  exception when others then bloques := bloques + 1;
  end;
  if bloques <> 4 then
    raise exception 'ÉCHEC R9 : %/4 saisies invalides refusées', bloques;
  end if;
  raise notice 'R9 OK — intitulé, dates, enfant et accompagnant contrôlés';
end $$;

-- ============ R10 : isolation entre foyers ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select count(*) into n from public.list_appointments(
    'aaaaaaaa-0000-0000-0000-000000000001', current_date, current_date + 30);
  if n <> 0 then
    raise exception 'ÉCHEC R10 : % rendez-vous d''un autre foyer visibles', n;
  end if;
  select count(*) into n from appointments
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'ÉCHEC R10b : lecture directe possible'; end if;
  raise notice 'R10 OK — rendez-vous isolés par foyer';
end $$;

select 'TESTS DES RENDEZ-VOUS PASSÉS' as resultat;
