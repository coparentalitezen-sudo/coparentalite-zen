-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00027 : rendez-vous et rappels
-- ============================================================

begin;

alter table calendar_events
  add column if not exists reminder_minutes int[] not null default '{}'::int[],
  add column if not exists reminder_text text;

alter table calendar_events drop constraint if exists calendar_events_end_after_start;
alter table calendar_events add constraint calendar_events_end_after_start
  check (ends_at is null or ends_at > starts_at);

alter table calendar_events drop constraint if exists calendar_events_reminders_valid;
alter table calendar_events add constraint calendar_events_reminders_valid
  check (cardinality(reminder_minutes) <= 5);

insert into notification_types
  (code, label, description, categorie, est_rappel, defaut_actif, sort_order, active)
values
  ('appointment_created', 'Nouveau rendez-vous',
   'Un rendez-vous ou une activité a été ajouté au planning.', 'planning', false, true, 14, true),
  ('appointment_updated', 'Rendez-vous modifié',
   'Un rendez-vous ou une activité a été modifié.', 'planning', false, true, 15, true),
  ('appointment_deleted', 'Rendez-vous supprimé',
   'Un rendez-vous ou une activité a été supprimé.', 'planning', false, true, 16, true),
  ('appointment_reminder', 'Rappel de rendez-vous',
   'Rappel pratique avant un rendez-vous : cartable, documents, équipement…', 'planning', true, true, 17, true)
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  categorie = excluded.categorie,
  est_rappel = excluded.est_rappel,
  sort_order = excluded.sort_order,
  active = true;

create or replace function public.reprogrammer_rappels_evenement(p_event uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  e calendar_events%rowtype;
  minutes int;
  n int := 0;
  texte text;
  destinataire uuid;
begin
  select * into e from calendar_events where id = p_event and deleted_at is null;
  if not found then return 0; end if;

  delete from notifications
   where entity = 'calendar_event'
     and entity_id = p_event
     and kind = 'appointment_reminder'
     and scheduled_at > now()
     and read_at is null;

  texte := coalesce(nullif(trim(e.reminder_text), ''),
                    'Pensez à vérifier les affaires et documents nécessaires.');

  foreach minutes in array e.reminder_minutes loop
    if e.starts_at - make_interval(mins => minutes) <= now() then
      continue;
    end if;

    for destinataire in
      select cm.profile_id from public.comptable_members(e.household_id) cm
    loop
      n := n + public.notifier(
        e.household_id,
        'appointment_reminder',
        format('Rappel : %s', e.title),
        texte,
        format('/app/planning?jour=%s', e.starts_at::date),
        'calendar_event',
        e.id,
        null,
        e.starts_at - make_interval(mins => minutes),
        destinataire
      );
    end loop;
  end loop;

  return n;
end $$;

create or replace function public.create_calendar_event(
  p_household uuid,
  p_child uuid,
  p_kind public.event_kind,
  p_title text,
  p_description text,
  p_location text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_all_day boolean,
  p_reminder_minutes int[],
  p_reminder_text text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
  child_name text;
  reminders int[];
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'Le titre est requis'; end if;
  if length(trim(p_title)) > 120 then raise exception 'Le titre est trop long'; end if;
  if p_starts_at is null then raise exception 'La date et l''heure sont requises'; end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'La fin doit être postérieure au début';
  end if;
  if p_child is not null and not exists (
    select 1 from children where id = p_child and household_id = p_household and deleted_at is null
  ) then raise exception 'Cet enfant n''appartient pas au foyer'; end if;

  reminders := coalesce((
    select array_agg(distinct m order by m)
    from unnest(coalesce(p_reminder_minutes, '{}'::int[])) m
    where m between 0 and 10080
  ), '{}'::int[]);
  if cardinality(reminders) > 5 then raise exception 'Cinq rappels maximum'; end if;

  insert into calendar_events (
    household_id, child_id, kind, title, description, location,
    starts_at, ends_at, all_day, created_by, reminder_minutes, reminder_text
  ) values (
    p_household, p_child, coalesce(p_kind, 'other'::event_kind), trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_location, '')), ''),
    p_starts_at, p_ends_at, coalesce(p_all_day, false), auth.uid(),
    reminders, nullif(trim(coalesce(p_reminder_text, '')), '')
  ) returning id into eid;

  select first_name into child_name from children where id = p_child;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
  values (p_household, auth.uid(), 'create', 'calendar_event', eid,
          jsonb_build_object('title', trim(p_title), 'starts_at', p_starts_at,
                             'child_id', p_child, 'reminders', reminders));

  perform public.notifier(
    p_household, 'appointment_created', 'Nouveau rendez-vous',
    format('%s%s — %s.', trim(p_title),
           case when child_name is null then '' else format(' pour %s', child_name) end,
           to_char(p_starts_at at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI')),
    format('/app/planning?jour=%s', p_starts_at::date),
    'calendar_event', eid, auth.uid()
  );

  perform public.reprogrammer_rappels_evenement(eid);
  return eid;
end $$;

create or replace function public.update_calendar_event(
  p_id uuid,
  p_child uuid,
  p_kind public.event_kind,
  p_title text,
  p_description text,
  p_location text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_all_day boolean,
  p_reminder_minutes int[],
  p_reminder_text text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  e calendar_events%rowtype;
  reminders int[];
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into e from calendar_events where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Ce rendez-vous n''existe plus'; end if;
  if not public.can_write(e.household_id) then raise exception 'Accès refusé'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Le titre est requis'; end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'La fin doit être postérieure au début';
  end if;
  if p_child is not null and not exists (
    select 1 from children where id = p_child and household_id = e.household_id and deleted_at is null
  ) then raise exception 'Cet enfant n''appartient pas au foyer'; end if;

  reminders := coalesce((
    select array_agg(distinct m order by m)
    from unnest(coalesce(p_reminder_minutes, '{}'::int[])) m
    where m between 0 and 10080
  ), '{}'::int[]);
  if cardinality(reminders) > 5 then raise exception 'Cinq rappels maximum'; end if;

  update calendar_events set
    child_id = p_child,
    kind = coalesce(p_kind, kind),
    title = trim(p_title),
    description = nullif(trim(coalesce(p_description, '')), ''),
    location = nullif(trim(coalesce(p_location, '')), ''),
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    all_day = coalesce(p_all_day, false),
    reminder_minutes = reminders,
    reminder_text = nullif(trim(coalesce(p_reminder_text, '')), ''),
    updated_at = now()
  where id = p_id;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before, after)
  values (e.household_id, auth.uid(), 'update', 'calendar_event', p_id,
          jsonb_build_object('title', e.title, 'starts_at', e.starts_at),
          jsonb_build_object('title', trim(p_title), 'starts_at', p_starts_at));

  perform public.notifier(
    e.household_id, 'appointment_updated', 'Rendez-vous modifié',
    format('%s — %s.', trim(p_title),
           to_char(p_starts_at at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI')),
    format('/app/planning?jour=%s', p_starts_at::date),
    'calendar_event', p_id, auth.uid()
  );
  perform public.reprogrammer_rappels_evenement(p_id);
end $$;

create or replace function public.delete_calendar_event(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare e calendar_events%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into e from calendar_events where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Ce rendez-vous n''existe plus'; end if;
  if not public.can_write(e.household_id) then raise exception 'Accès refusé'; end if;

  update calendar_events set deleted_at = now(), updated_at = now() where id = p_id;
  delete from notifications
   where entity = 'calendar_event' and entity_id = p_id
     and kind = 'appointment_reminder' and scheduled_at > now() and read_at is null;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before)
  values (e.household_id, auth.uid(), 'delete', 'calendar_event', p_id,
          jsonb_build_object('title', e.title, 'starts_at', e.starts_at));

  perform public.notifier(
    e.household_id, 'appointment_deleted', 'Rendez-vous supprimé',
    format('%s, prévu le %s.', e.title,
           to_char(e.starts_at at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI')),
    '/app/planning', 'calendar_event', p_id, auth.uid()
  );
end $$;

create or replace function public.list_calendar_events(
  p_household uuid, p_from timestamptz, p_to timestamptz
) returns table (
  id uuid, child_id uuid, child_name text, kind text, title text,
  description text, location text, starts_at timestamptz, ends_at timestamptz,
  all_day boolean, reminder_minutes int[], reminder_text text,
  created_by uuid, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.child_id, c.first_name, e.kind::text, e.title,
         e.description, e.location, e.starts_at, e.ends_at, e.all_day,
         e.reminder_minutes, e.reminder_text,
         e.created_by, e.created_at, e.updated_at
  from calendar_events e
  left join children c on c.id = e.child_id
  where e.household_id = p_household
    and public.is_member(p_household)
    and e.deleted_at is null
    and e.starts_at < p_to
    and coalesce(e.ends_at, e.starts_at + interval '1 minute') >= p_from
  order by e.starts_at, e.title
$$;

revoke all on function public.reprogrammer_rappels_evenement(uuid) from public, anon, authenticated;
revoke all on function public.create_calendar_event(uuid, uuid, public.event_kind, text, text, text, timestamptz, timestamptz, boolean, int[], text) from public, anon;
revoke all on function public.update_calendar_event(uuid, uuid, public.event_kind, text, text, text, timestamptz, timestamptz, boolean, int[], text) from public, anon;
revoke all on function public.delete_calendar_event(uuid) from public, anon;
revoke all on function public.list_calendar_events(uuid, timestamptz, timestamptz) from public, anon;

grant execute on function public.create_calendar_event(uuid, uuid, public.event_kind, text, text, text, timestamptz, timestamptz, boolean, int[], text) to authenticated;
grant execute on function public.update_calendar_event(uuid, uuid, public.event_kind, text, text, text, timestamptz, timestamptz, boolean, int[], text) to authenticated;
grant execute on function public.delete_calendar_event(uuid) to authenticated;
grant execute on function public.list_calendar_events(uuid, timestamptz, timestamptz) to authenticated;

commit;
