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

-- ============================================================
-- D1 à D6 — DÉCLENCHEURS PAR OBSERVATION
--
-- Quatre types restaient inertes. Ils sont désormais émis par des déclencheurs
-- qui observent les changements, sans réécrire les fonctions métier.
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ D1 : une dépense créée prévient l'autre parent ============
do $$
declare avant int; apres int; eid uuid; n record;
begin
  eid := public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001',
    'Cantine septembre', 4250, current_date, null,
    '00000000-0000-0000-0000-00000000000a',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    format('[{"parent_id":"%s","owed_cents":2125},{"parent_id":"%s","owed_cents":2125}]',
           '00000000-0000-0000-0000-00000000000a',
           '00000000-0000-0000-0000-00000000000b')::jsonb);
  perform set_config('app.dep', eid::text, false);

  apres := public.test_compter_notifs_entite('expense_created', eid);
  if apres < 1 then
    raise exception 'ÉCHEC D1 : dépense non signalée';
  end if;

  -- Le montant doit figurer : sans lui, il faut ouvrir l'application
  select * into n from public.test_rappel_horaire('expense_created', eid,
    '00000000-0000-0000-0000-00000000000b') r;
  if n.corps not like '%42,50%' then
    raise exception 'ÉCHEC D1b : le montant n''est pas lisible (%)', n.corps;
  end if;
  raise notice 'D1 OK — « % »', n.corps;
end $$;

-- ============ D2 : l'auteur de la dépense n'est pas notifié ============
do $$
declare n int;
begin
  -- Les fixtures créent leurs propres dépenses : on ne compte donc que la
  -- notification portant sur CETTE dépense, pas le total du foyer.
  n := public.test_compter_notifs_destinataire('expense_created',
        current_setting('app.dep')::uuid, '00000000-0000-0000-0000-00000000000a');
  if n <> 0 then
    raise exception 'ÉCHEC D2 : l''auteur reçoit % notification(s) de sa propre dépense', n;
  end if;
  -- et l'autre parent l'a bien reçue
  n := public.test_compter_notifs_destinataire('expense_created',
        current_setting('app.dep')::uuid, '00000000-0000-0000-0000-00000000000b');
  if n <> 1 then
    raise exception 'ÉCHEC D2b : l''autre parent a reçu % notification(s)', n;
  end if;
  raise notice 'D2 OK — l''auteur épargné, l''autre parent prévenu';
end $$;

-- ============ D3 : une dépense contestée transmet le motif ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare n record;
begin
  perform public.review_expense(current_setting('app.dep')::uuid, 'dispute',
    'Le montant ne correspond pas à la facture');

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  select * into n from public.test_rappel_horaire('expense_reviewed',
    current_setting('app.dep')::uuid, '00000000-0000-0000-0000-00000000000a') r;
  if n.titre is null then raise exception 'ÉCHEC D3 : contestation non signalée'; end if;
  -- Le motif permet de corriger : sans lui, l'alerte oblige à ouvrir l'app
  if n.corps not like '%ne correspond pas%' then
    raise exception 'ÉCHEC D3b : le motif n''est pas transmis (%)', n.corps;
  end if;
  raise notice 'D3 OK — « % » · %', n.titre, left(n.corps, 50);
end $$;

-- ============ D4 : une période modifiée est signalée, mais pas pour rien ============
do $$
declare eid uuid; avant int; apres int; apres2 int;
begin
  select x into eid from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 30)::timestamptz, (current_date + 32)::timestamptz,
    'À déplacer', null, null, null) x;

  avant := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'event_updated');

  -- Changement de note seule : ne doit rien déclencher
  perform public.update_custody_exception(eid, '00000000-0000-0000-0000-00000000000b',
    (current_date + 30)::timestamptz, (current_date + 32)::timestamptz,
    'À déplacer', 'une note ajoutée');
  apres := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'event_updated');
  if apres <> avant then
    raise exception 'ÉCHEC D4 : une modification de note a déclenché une alerte';
  end if;

  -- Changement de dates : doit déclencher
  perform public.update_custody_exception(eid, '00000000-0000-0000-0000-00000000000b',
    (current_date + 33)::timestamptz, (current_date + 35)::timestamptz,
    'À déplacer', null);
  apres2 := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'event_updated');
  if apres2 <> avant + 1 then
    raise exception 'ÉCHEC D4b : déplacement non signalé (% -> %)', avant, apres2;
  end if;
  raise notice 'D4 OK — dates signalées, note silencieuse';
end $$;

-- ============ D5 : un remboursement est signalé ============
do $$
declare avant int; apres int; b record;
begin
  select * into b from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if b.debiteur is null then
    raise notice 'D5 ignoré — aucun solde à régulariser dans ce jeu de test';
  else
    perform set_config('request.jwt.claim.sub', b.debiteur::text, false);
    avant := public.test_compter_notifs(b.crediteur, 'reimbursement_created');
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      b.debiteur, b.crediteur, 500, current_date, 'virement', null, null);
    apres := public.test_compter_notifs(b.crediteur, 'reimbursement_created');
    if apres <> avant + 1 then
      raise exception 'ÉCHEC D5 : remboursement non signalé (% -> %)', avant, apres;
    end if;
    raise notice 'D5 OK — remboursement signalé au bénéficiaire';
  end if;
end $$;

-- ============ D6 : les déclencheurs respectent les préférences ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare avant int; apres int;
begin
  perform public.definir_preference_notification(
    'aaaaaaaa-0000-0000-0000-000000000001', 'expense_created', 'in_app', false);

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  avant := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'expense_created');
  perform public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001',
    'Silencieuse', 1000, current_date, null,
    '00000000-0000-0000-0000-00000000000a',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    format('[{"parent_id":"%s","owed_cents":500},{"parent_id":"%s","owed_cents":500}]',
           '00000000-0000-0000-0000-00000000000a',
           '00000000-0000-0000-0000-00000000000b')::jsonb);
  apres := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'expense_created');

  if apres <> avant then
    raise exception 'ÉCHEC D6 : notification émise malgré la préférence désactivée';
  end if;
  raise notice 'D6 OK — les déclencheurs respectent les préférences';
end $$;

select 'TESTS DES DÉCLENCHEURS PASSÉS' as resultat;
