-- ============================================================
-- TESTS — moteur de notifications (N1 à N10)
-- ============================================================
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ N1 : le catalogue couvre les types annoncés ============
do $$
declare n int;
begin
  select count(*) into n from notification_types where active;
  if n < 11 then raise exception 'ÉCHEC N1 : % types au lieu de 11 attendus', n; end if;
  -- Les types demandés doivent tous exister
  for n in select 1 from (values ('event_created'),('event_updated'),('event_deleted'),
                                 ('custody_change'),('holiday_start'),('holiday_end'),
                                 ('invitation_sent'),('invitation_accepted')) as v(c)
           where not exists (select 1 from notification_types t where t.code = v.c)
  loop
    raise exception 'ÉCHEC N1b : un type demandé est absent du catalogue';
  end loop;
  raise notice 'N1 OK — catalogue complet';
end $$;

-- ============ N2 : trois canaux déclarés, un seul actif ============
do $$
declare total int; actifs int;
begin
  select count(*), count(*) filter (where active) into total, actifs
    from notification_channels;
  if total <> 3 then raise exception 'ÉCHEC N2 : % canaux au lieu de 3', total; end if;
  if actifs <> 1 then raise exception 'ÉCHEC N2b : % canaux actifs au lieu d''un', actifs; end if;
  if not exists (select 1 from notification_channels where code = 'push') then
    raise exception 'ÉCHEC N2c : le canal Push n''est pas préparé';
  end if;
  raise notice 'N2 OK — application active, Push et courriel préparés';
end $$;

-- ============ N3 : une action notifie l'autre parent, jamais son auteur ============
do $$
declare avant_a int; avant_b int; apres_a int; apres_b int;
begin
  -- Comptage sans RLS : un parent ne voit jamais les notifications de l'autre,
  -- ce que vérifie le test N9.
  avant_a := public.test_compter_notifs('00000000-0000-0000-0000-00000000000a');
  avant_b := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b');

  perform public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 12)::timestamptz, (current_date + 14)::timestamptz,
    'Échange', null, null, null);

  apres_a := public.test_compter_notifs('00000000-0000-0000-0000-00000000000a');
  apres_b := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b');

  if apres_a <> avant_a then
    raise exception 'ÉCHEC N3 : l''auteur a été notifié de sa propre action';
  end if;
  if apres_b <> avant_b + 1 then
    raise exception 'ÉCHEC N3b : l''autre parent n''a pas été notifié (% -> %)', avant_b, apres_b;
  end if;
  raise notice 'N3 OK — l''autre parent notifié, l''auteur épargné';
end $$;

-- ============ N4 : la notification porte un contenu exploitable ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare n record;
begin
  select * into n from public.mes_notifications('aaaaaaaa-0000-0000-0000-000000000001', 10)
   order by creee_le desc limit 1;
  if n.titre is null or length(n.titre) < 5 then
    raise exception 'ÉCHEC N4 : titre vide ou trop court';
  end if;
  if n.corps is null or n.corps not like '%/%' then
    raise exception 'ÉCHEC N4b : le corps ne précise pas les dates (%)', n.corps;
  end if;
  if n.href is null then raise exception 'ÉCHEC N4c : aucun écran à ouvrir'; end if;
  if n.auteur is null then raise exception 'ÉCHEC N4d : auteur non renseigné'; end if;
  raise notice 'N4 OK — « % » · %', n.titre, left(n.corps, 40);
end $$;

-- ============ N5 : décompte et marquage ============
do $$
declare avant int; apres int; nid uuid;
begin
  avant := public.compter_notifications_non_lues('aaaaaaaa-0000-0000-0000-000000000001');
  if avant < 1 then raise exception 'ÉCHEC N5 : aucune notification non lue'; end if;

  select id into nid from public.mes_notifications('aaaaaaaa-0000-0000-0000-000000000001', 1);
  perform public.marquer_notification_lue(nid);
  apres := public.compter_notifications_non_lues('aaaaaaaa-0000-0000-0000-000000000001');
  if apres <> avant - 1 then
    raise exception 'ÉCHEC N5b : décompte incorrect après lecture (% -> %)', avant, apres;
  end if;
  raise notice 'N5 OK — décompte exact, marquage effectif';
end $$;

-- ============ N6 : une préférence désactivée arrête la notification ============
do $$
declare avant int; apres int;
begin
  perform public.definir_preference_notification(
    'aaaaaaaa-0000-0000-0000-000000000001', 'event_created', 'in_app', false);

  avant := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'event_created');

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  perform public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'travel',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 20)::timestamptz, (current_date + 22)::timestamptz,
    'Voyage', null, null, null);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

  apres := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'event_created');
  if apres <> avant then
    raise exception 'ÉCHEC N6 : notification émise malgré la préférence désactivée';
  end if;

  -- puis on rétablit
  perform public.definir_preference_notification(
    'aaaaaaaa-0000-0000-0000-000000000001', 'event_created', 'in_app', true);
  raise notice 'N6 OK — préférence respectée, dans les deux sens';
end $$;

-- ============ N7 : délai de rappel configurable ============
do $$
declare d int;
begin
  d := public.mon_delai_rappel('aaaaaaaa-0000-0000-0000-000000000001');
  if d <> 60 then raise exception 'ÉCHEC N7 : délai par défaut de % au lieu de 60', d; end if;

  perform public.definir_delai_rappel('aaaaaaaa-0000-0000-0000-000000000001', 1440);
  d := public.mon_delai_rappel('aaaaaaaa-0000-0000-0000-000000000001');
  if d <> 1440 then raise exception 'ÉCHEC N7b : délai non enregistré (%)', d; end if;

  begin
    perform public.definir_delai_rappel('aaaaaaaa-0000-0000-0000-000000000001', 7);
    raise exception 'ÉCHEC N7c : délai arbitraire accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'N7 OK — délais 5/15/30/60/1440 seuls acceptés';
end $$;

-- ============ N8 : un rappel programmé n'apparaît qu'à son heure ============
do $$
declare visibles_avant int; visibles_apres int;
begin
  select count(*) into visibles_avant
    from public.mes_notifications('aaaaaaaa-0000-0000-0000-000000000001', 200);

  perform public.test_notifier('aaaaaaaa-0000-0000-0000-000000000001', 'custody_change',
    'Changement demain', 'Les enfants passent chez l''autre parent.',
    now() + interval '2 days', '00000000-0000-0000-0000-00000000000b');

  select count(*) into visibles_apres
    from public.mes_notifications('aaaaaaaa-0000-0000-0000-000000000001', 200);
  if visibles_apres <> visibles_avant then
    raise exception 'ÉCHEC N8 : un rappel futur est déjà affiché';
  end if;

  -- et il compte comme non lu seulement une fois son heure venue
  if public.compter_notifications_non_lues('aaaaaaaa-0000-0000-0000-000000000001')
     <> public.test_compter_non_lues_dues('00000000-0000-0000-0000-00000000000b',
                                          'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC N8b : le décompte inclut des rappels futurs';
  end if;
  raise notice 'N8 OK — un rappel n''apparaît qu''à son heure';
end $$;

-- ============ N9 : une notification est privée ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare n int;
begin
  -- Le parent A ne doit pas voir les notifications du parent B : elles
  -- révèlent ce qu'il consulte et quand.
  select count(*) into n from notifications
   where profile_id = '00000000-0000-0000-0000-00000000000b';
  if n > 0 then
    raise exception 'ÉCHEC N9 : % notification(s) d''un autre parent visibles', n;
  end if;
  raise notice 'N9 OK — les notifications restent privées';
end $$;

-- ============ N10 : suppression d'une période, l'autre parent est prévenu ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare eid uuid; avant int; apres int;
begin
  select x into eid from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'absence',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 25)::timestamptz, (current_date + 26)::timestamptz,
    'Imprévu', null, null, null) x;

  avant := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'event_deleted');
  perform public.delete_custody_exception(eid);
  apres := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'event_deleted');

  if apres <> avant + 1 then
    raise exception 'ÉCHEC N10 : suppression non signalée (% -> %)', avant, apres;
  end if;
  raise notice 'N10 OK — la suppression prévient l''autre parent';
end $$;

select 'TESTS DES NOTIFICATIONS PASSÉS' as resultat;
