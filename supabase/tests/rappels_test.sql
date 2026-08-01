-- ============================================================
-- TESTS — programmation des rappels (P1 à P9)
--
-- Le point critique est l'idempotence : la tâche s'exécute chaque nuit et
-- repasse sur les mêmes événements. Sans garde-fou, un rendez-vous produirait
-- un rappel par jour jusqu'à sa date.
-- ============================================================
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- Un rendez-vous dans cinq jours, avec des affaires non préparées
do $$
declare rid uuid;
begin
  rid := public.create_appointment(
    'aaaaaaaa-0000-0000-0000-000000000001', 'sport', 'Match de foot',
    (current_date + 5 + time '10:00')::timestamptz, null, false, 'Stade municipal', null,
    null, array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    array['Tenue de sport', 'Gourde']);
  perform set_config('app.rdv2', rid::text, false);
end $$;

-- ============ P1 : un rappel est programmé pour chaque parent ============
do $$
declare n int;
begin
  n := public.test_programmer_rdv('aaaaaaaa-0000-0000-0000-000000000001');
  if n < 2 then
    raise exception 'ÉCHEC P1 : % rappel(s) programmé(s), les deux parents devraient l''être', n;
  end if;
  raise notice 'P1 OK — % rappels programmés', n;
end $$;

-- ============ P2 : IDEMPOTENCE — repasser ne crée rien de plus ============
do $$
declare avant int; n int; apres int;
begin
  avant := public.test_compter_notifs_type('appointment_reminder');
  n := public.test_programmer_rdv('aaaaaaaa-0000-0000-0000-000000000001');
  apres := public.test_compter_notifs_type('appointment_reminder');

  if n <> 0 then
    raise exception 'ÉCHEC P2 : % rappel(s) reprogrammé(s) sans changement', n;
  end if;
  if avant <> apres then
    raise exception 'ÉCHEC P2b : doublons créés (% -> %) — un rappel par nuit jusqu''à la date',
      avant, apres;
  end if;
  raise notice 'P2 OK — la tâche est rejouable sans effet';
end $$;

-- ============ P3 : le rappel porte les affaires à prévoir ============
do $$
declare n record;
begin
  select * into n from public.test_rappel_horaire('appointment_reminder',
    current_setting('app.rdv2')::uuid, '00000000-0000-0000-0000-00000000000b') r;
  if n.corps not like '%Tenue de sport%' then
    raise exception 'ÉCHEC P3 : les affaires ne sont pas rappelées (%)', n.corps;
  end if;
  if n.corps not like '%Stade municipal%' then
    raise exception 'ÉCHEC P3b : le lieu n''est pas rappelé';
  end if;
  raise notice 'P3 OK — « % »', left(n.corps, 70);
end $$;

-- ============ P4 : le délai de chaque parent est respecté ============
do $$
declare debut timestamptz; quand_a timestamptz; quand_b timestamptz;
begin
  -- Un parent veut la veille, l'autre une heure avant
  perform public.test_definir_delai('00000000-0000-0000-0000-00000000000a',
    'aaaaaaaa-0000-0000-0000-000000000001', 1440);
  perform public.test_definir_delai('00000000-0000-0000-0000-00000000000b',
    'aaaaaaaa-0000-0000-0000-000000000001', 60);

  perform public.test_purger_notifs('appointment_reminder');
  perform public.test_programmer_rdv('aaaaaaaa-0000-0000-0000-000000000001');

  select starts_at into debut from appointments where id = current_setting('app.rdv2')::uuid;
  select r.quand into quand_a from public.test_rappel_horaire('appointment_reminder',
    current_setting('app.rdv2')::uuid, '00000000-0000-0000-0000-00000000000a') r;
  select r.quand into quand_b from public.test_rappel_horaire('appointment_reminder',
    current_setting('app.rdv2')::uuid, '00000000-0000-0000-0000-00000000000b') r;

  if quand_a <> debut - interval '1440 minutes' then
    raise exception 'ÉCHEC P4 : délai du premier parent non respecté';
  end if;
  if quand_b <> debut - interval '60 minutes' then
    raise exception 'ÉCHEC P4b : délai du second parent non respecté';
  end if;
  if quand_a = quand_b then
    raise exception 'ÉCHEC P4c : les deux parents reçoivent le même horaire';
  end if;
  raise notice 'P4 OK — chaque parent a son propre horaire';
end $$;

-- ============ P5 : un rendez-vous déplacé réactive le rappel ============
do $$
declare avant timestamptz; apres timestamptz; v_lu timestamptz;
begin
  select r.quand into avant from public.test_rappel_horaire('appointment_reminder',
    current_setting('app.rdv2')::uuid, '00000000-0000-0000-0000-00000000000b') r;

  -- Le parent a déjà lu le rappel
  perform public.test_marquer_lu_direct('appointment_reminder',
    current_setting('app.rdv2')::uuid, '00000000-0000-0000-0000-00000000000b');

  perform public.update_appointment(current_setting('app.rdv2')::uuid, 'Match de foot',
    (current_date + 6 + time '10:00')::timestamptz);
  perform public.test_programmer_rdv('aaaaaaaa-0000-0000-0000-000000000001');

  select r.quand, r.lu into apres, v_lu from public.test_rappel_horaire('appointment_reminder',
    current_setting('app.rdv2')::uuid, '00000000-0000-0000-0000-00000000000b') r;

  if apres = avant then
    raise exception 'ÉCHEC P5 : le rappel n''a pas suivi le déplacement du rendez-vous';
  end if;
  if v_lu is not null then
    raise exception 'ÉCHEC P5b : le rappel reste marqué lu alors que la date a changé';
  end if;
  raise notice 'P5 OK — rendez-vous déplacé : rappel réactivé';
end $$;

-- ============ P6 : préférence désactivée, aucun rappel ============
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  perform public.definir_preference_notification(
    'aaaaaaaa-0000-0000-0000-000000000001', 'appointment_reminder', 'in_app', false);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

  perform public.test_purger_notifs('appointment_reminder');
  perform public.test_programmer_rdv('aaaaaaaa-0000-0000-0000-000000000001');

  n := public.test_compter_notifs('00000000-0000-0000-0000-00000000000b', 'appointment_reminder');
  if n <> 0 then
    raise exception 'ÉCHEC P6 : % rappel(s) malgré la préférence désactivée', n;
  end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  perform public.definir_preference_notification(
    'aaaaaaaa-0000-0000-0000-000000000001', 'appointment_reminder', 'in_app', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  raise notice 'P6 OK — préférence respectée pour les rappels aussi';
end $$;

-- ============ P7 : un rendez-vous annulé purge son rappel ============
do $$
declare avant int; apres int; purges int;
begin
  perform public.test_programmer_rdv('aaaaaaaa-0000-0000-0000-000000000001');
  avant := public.test_compter_notifs_entite('appointment_reminder', current_setting('app.rdv2')::uuid);
  if avant = 0 then raise exception 'ÉCHEC P7 : aucun rappel à purger'; end if;

  perform public.delete_appointment(current_setting('app.rdv2')::uuid);
  purges := public.test_purger_rappels('aaaaaaaa-0000-0000-0000-000000000001');

  apres := public.test_compter_notifs_entite('appointment_reminder', current_setting('app.rdv2')::uuid);
  if apres <> 0 then
    raise exception 'ÉCHEC P7b : % rappel(s) subsistent pour un rendez-vous annulé', apres;
  end if;
  raise notice 'P7 OK — % rappel(s) purgé(s) à l''annulation', purges;
end $$;

-- ============ P8 : un rappel dont l'heure est passée n'est pas créé ============
do $$
declare cree boolean;
begin
  cree := public.test_programmer_rappel(
    'aaaaaaaa-0000-0000-0000-000000000001', 'custody_change',
    '00000000-0000-0000-0000-00000000000b', 'Passé', 'corps',
    'custody_change', gen_random_uuid(), now() - interval '1 hour');
  if cree then
    raise exception 'ÉCHEC P8 : un rappel a été programmé dans le passé';
  end if;
  raise notice 'P8 OK — aucun rappel programmé pour un moment révolu';
end $$;

-- ============ P9 : rappel de changement de garde, idempotent lui aussi ============
do $$
declare n1 int; n2 int;
begin
  n1 := public.test_programmer_changement('aaaaaaaa-0000-0000-0000-000000000001',
    (current_date + 4)::date, '00000000-0000-0000-0000-00000000000b', time '18:00');
  n2 := public.test_programmer_changement('aaaaaaaa-0000-0000-0000-000000000001',
    (current_date + 4)::date, '00000000-0000-0000-0000-00000000000b', time '18:00');
  if n1 = 0 then raise exception 'ÉCHEC P9 : aucun rappel de changement programmé'; end if;
  if n2 <> 0 then
    raise exception 'ÉCHEC P9b : % rappel(s) dupliqué(s) au second passage', n2;
  end if;
  raise notice 'P9 OK — % rappels de changement, rejouables sans doublon', n1;
end $$;

select 'TESTS DES RAPPELS PASSÉS' as resultat;
