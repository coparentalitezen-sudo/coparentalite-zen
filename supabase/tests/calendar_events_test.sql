-- ============================================================
-- TESTS — rendez-vous et rappels (E1 à E6)
-- ============================================================
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- E1 : création complète et lecture
DO $$
declare eid uuid; e record;
begin
  eid := public.create_calendar_event(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'cccccccc-0000-0000-0000-000000000001',
    'school', 'Réunion avec la maîtresse', 'Apporter le carnet', 'École',
    now() + interval '3 days', now() + interval '3 days 1 hour', false,
    array[60,1440], 'N''oublie pas son cartable et le carnet.'
  );
  select * into e from public.list_calendar_events(
    'aaaaaaaa-0000-0000-0000-000000000001', now(), now() + interval '4 days'
  ) where id = eid;
  if e.id is null or e.title <> 'Réunion avec la maîtresse' then
    raise exception 'ÉCHEC E1 : rendez-vous absent ou altéré';
  end if;
  if cardinality(e.reminder_minutes) <> 2 then
    raise exception 'ÉCHEC E1b : rappels non enregistrés';
  end if;
  raise notice 'E1 OK — création et lecture complètes';
end $$;

-- E2 : l'autre parent reçoit la création, l'auteur non
DO $$
declare a int; b int;
begin
  select count(*) into a from notifications
   where profile_id = '00000000-0000-0000-0000-00000000000a'
     and kind = 'appointment_created';
  select count(*) into b from notifications
   where profile_id = '00000000-0000-0000-0000-00000000000b'
     and kind = 'appointment_created';
  if a <> 0 then raise exception 'ÉCHEC E2 : auteur notifié de sa propre création'; end if;
  if b < 1 then raise exception 'ÉCHEC E2b : second parent non notifié'; end if;
  raise notice 'E2 OK — notification de création ciblée';
end $$;

-- E3 : les rappels futurs sont programmés pour les deux parents
DO $$
declare n int;
begin
  select count(*) into n from notifications
   where kind = 'appointment_reminder'
     and scheduled_at > now()
     and profile_id in ('00000000-0000-0000-0000-00000000000a',
                        '00000000-0000-0000-0000-00000000000b');
  if n < 4 then raise exception 'ÉCHEC E3 : % rappels au lieu d''au moins 4', n; end if;
  raise notice 'E3 OK — rappels programmés pour les deux parents';
end $$;

-- E4 : modification reprogramme sans accumuler les anciens rappels
DO $$
declare eid uuid; avant int; apres int;
begin
  select id into eid from calendar_events where title = 'Réunion avec la maîtresse' limit 1;
  select count(*) into avant from notifications
   where entity_id = eid and kind = 'appointment_reminder' and scheduled_at > now();
  perform public.update_calendar_event(
    eid, 'cccccccc-0000-0000-0000-000000000001', 'school',
    'Réunion déplacée', null, 'École',
    now() + interval '5 days', now() + interval '5 days 1 hour', false,
    array[30], 'Prendre le carnet.'
  );
  select count(*) into apres from notifications
   where entity_id = eid and kind = 'appointment_reminder' and scheduled_at > now();
  if apres <> 2 then raise exception 'ÉCHEC E4 : % rappels après modification au lieu de 2', apres; end if;
  if apres >= avant and avant > 2 then raise exception 'ÉCHEC E4b : anciens rappels non nettoyés'; end if;
  raise notice 'E4 OK — modification et reprogrammation idempotente';
end $$;

-- E5 : suppression annule les rappels futurs
DO $$
declare eid uuid; n int;
begin
  select id into eid from calendar_events where title = 'Réunion déplacée' limit 1;
  perform public.delete_calendar_event(eid);
  select count(*) into n from notifications
   where entity_id = eid and kind = 'appointment_reminder' and scheduled_at > now();
  if n <> 0 then raise exception 'ÉCHEC E5 : % rappel(s) encore programmé(s)', n; end if;
  if exists (select 1 from public.list_calendar_events(
    'aaaaaaaa-0000-0000-0000-000000000001', now(), now() + interval '10 days') where id = eid)
  then raise exception 'ÉCHEC E5b : rendez-vous supprimé encore visible'; end if;
  raise notice 'E5 OK — suppression et annulation des rappels';
end $$;

-- E6 : isolation entre foyers
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
DO $$
declare n int;
begin
  select count(*) into n from public.list_calendar_events(
    'bbbbbbbb-0000-0000-0000-000000000002', now(), now() + interval '10 days');
  if n <> 0 then raise exception 'ÉCHEC E6 : événement d''un autre foyer visible'; end if;
  raise notice 'E6 OK — isolation entre foyers';
end $$;

select 'TESTS DES RENDEZ-VOUS PASSÉS' as resultat;
