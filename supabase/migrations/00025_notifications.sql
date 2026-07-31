-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00025 : moteur de notifications
--
-- PRINCIPE
-- Une notification est un fait : « une dépense a été ajoutée », « les vacances
-- commencent demain ». Le canal par lequel elle atteint le parent — dans
-- l'application, par notification poussée, par courriel — est une question
-- distincte, réglée séparément.
--
-- Cette séparation permet d'activer le Push puis le courriel sans rien
-- reprendre : seule la table notification_deliveries gagnera des lignes.
--
-- CE QUI EST LIVRÉ ACTIF : le canal « application » (centre de notifications
-- et pastille). Les canaux « push » et « courriel » sont déclarés mais
-- inactifs : les préférences les acceptent déjà, aucun envoi n'est tenté.
--
-- RESPECT DU DESTINATAIRE
-- Un parent n'est jamais notifié de sa propre action, ni d'un rappel qui ne le
-- concerne pas. Une notification inutile est une notification qu'on finit par
-- ignorer — et avec elle, celles qui comptaient.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Catalogue des types ----------
create table if not exists notification_types (
  code          text primary key,
  label         text not null,
  description   text,
  -- Regroupement pour l'écran de préférences
  categorie     text not null,
  -- Actif par défaut chez un nouveau parent
  defaut_actif  boolean not null default true,
  -- Un rappel se programme à l'avance ; un fait se notifie sur-le-champ
  est_rappel    boolean not null default false,
  sort_order    smallint not null default 100,
  active        boolean not null default true
);

insert into notification_types
  (code, label, description, categorie, defaut_actif, est_rappel, sort_order)
values
  ('event_created', 'Ajout d''une période',
   'Une période de garde, un voyage ou une absence vient d''être ajouté.',
   'planning', true, false, 10),
  ('event_updated', 'Modification d''une période',
   'Les dates ou le parent gardien d''une période ont changé.',
   'planning', true, false, 20),
  ('event_deleted', 'Suppression d''une période',
   'Une période a été retirée : le rythme habituel reprend.',
   'planning', true, false, 30),
  ('custody_change', 'Changement de garde',
   'Rappel avant le passage des enfants d''un parent à l''autre.',
   'planning', true, true, 40),
  ('holiday_start', 'Début des vacances',
   'Rappel la veille du premier jour d''une période de vacances.',
   'planning', true, true, 50),
  ('holiday_end', 'Fin des vacances',
   'Rappel la veille du retour au rythme habituel.',
   'planning', true, true, 60),
  ('expense_created', 'Nouvelle dépense',
   'Une dépense a été ajoutée et attend votre relecture.',
   'depenses', true, false, 70),
  ('expense_reviewed', 'Dépense validée ou à vérifier',
   'L''autre parent s''est prononcé sur une dépense.',
   'depenses', true, false, 80),
  ('reimbursement_created', 'Remboursement enregistré',
   'Un remboursement vient d''être déclaré.',
   'depenses', true, false, 90),
  ('invitation_sent', 'Invitation envoyée',
   'Une invitation a été créée pour le second parent.',
   'foyer', true, false, 100),
  ('invitation_accepted', 'Le second parent a rejoint',
   'Votre foyer est désormais partagé.',
   'foyer', true, false, 110)
on conflict (code) do update set
  label = excluded.label, description = excluded.description,
  categorie = excluded.categorie, defaut_actif = excluded.defaut_actif,
  est_rappel = excluded.est_rappel, sort_order = excluded.sort_order;

-- ---------- 2. Canaux ----------
create table if not exists notification_channels (
  code        text primary key,
  label       text not null,
  description text,
  -- Correspondance avec le type énuméré notif_channel du schéma initial
  canal_interne text not null default 'internal',
  -- Un canal inactif est proposé mais aucun envoi n'est tenté
  active      boolean not null default false,
  sort_order  smallint not null default 100
);

insert into notification_channels (code, label, description, canal_interne, active, sort_order) values
  ('in_app', 'Dans l''application',
   'Centre de notifications et pastille sur la cloche.', 'internal', true, 10),
  ('push', 'Notification poussée',
   'Alerte sur votre téléphone, même application fermée.', 'push', false, 20),
  ('email', 'Courriel',
   'Message dans votre boîte de réception.', 'email', false, 30)
on conflict (code) do update set
  label = excluded.label, description = excluded.description,
  canal_interne = excluded.canal_interne, sort_order = excluded.sort_order;

-- ---------- 3. Préférences ----------
-- La table existe depuis le schéma initial, avec les colonnes kind et channel
-- (type énuméré notif_channel). On la complète plutôt que d'en créer une
-- concurrente : deux tables de préférences finiraient par diverger.
alter table notification_preferences add column if not exists household_id uuid references households(id);

create index if not exists idx_notif_pref_profil
  on notification_preferences (profile_id, household_id);

-- Les préférences deviennent propres à chaque foyer : un parent peut vouloir
-- être alerté différemment selon le contexte.
do $$ begin
  if exists (select 1 from pg_constraint
             where conname = 'notification_preferences_profile_id_kind_channel_key') then
    alter table notification_preferences
      drop constraint notification_preferences_profile_id_kind_channel_key;
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'notification_preferences_unicite') then
    alter table notification_preferences
      add constraint notification_preferences_unicite
      unique (profile_id, household_id, kind, channel);
  end if;
end $$;

-- ---------- 4. Délais de rappel ----------
-- Un seul délai par parent et par foyer : plusieurs rappels pour un même
-- événement finiraient par être ignorés.
create table if not exists reminder_settings (
  profile_id   uuid not null references profiles(id),
  household_id uuid not null references households(id),
  -- minutes avant l'événement ; 1440 = la veille à la même heure
  minutes_avant int not null default 60
    check (minutes_avant in (5, 15, 30, 60, 1440)),
  updated_at   timestamptz not null default now(),
  primary key (profile_id, household_id)
);

-- ---------- 5. Notifications ----------
-- Table existante (profile_id, household_id, kind, title, body, link_path,
-- read_at). On y ajoute ce qui manque : l'entité concernée, l'auteur et la
-- date de pertinence, indispensable aux rappels.
alter table notifications add column if not exists entity text;
alter table notifications add column if not exists entity_id uuid;
alter table notifications add column if not exists actor_id uuid references profiles(id);
alter table notifications add column if not exists scheduled_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_kind_fk') then
    alter table notifications
      add constraint notifications_kind_fk foreign key (kind)
      references notification_types(code);
  end if;
end $$;

create index if not exists idx_notif_destinataire
  on notifications (profile_id, household_id, scheduled_at desc);
create index if not exists idx_notif_non_lues
  on notifications (profile_id, household_id) where read_at is null;

-- ---------- 6. Traces d'envoi ----------
-- Prépare le Push et le courriel : chaque tentative d'acheminement laissera
-- une ligne, sans modifier la notification elle-même.
create table if not exists notification_deliveries (
  id              bigint generated always as identity primary key,
  notification_id uuid not null references notifications(id) on delete cascade,
  channel_code    text not null references notification_channels(code),
  statut          text not null check (statut in ('en_attente', 'envoye', 'echec')),
  message         text,
  attempted_at    timestamptz not null default now(),
  unique (notification_id, channel_code)
);

-- ---------- 7. Abonnements Push ----------
-- Table créée dès maintenant : activer le Push ne demandera qu'un service de
-- livraison, sans migration de structure.
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  deleted_at   timestamptz
);

create index if not exists idx_push_profil
  on push_subscriptions (profile_id) where deleted_at is null;

-- ---------- 8. Émission ----------
-- Crée une notification pour chaque membre concerné, en respectant ses
-- préférences. L'auteur de l'action n'est jamais notifié de sa propre action.
create or replace function public.notifier(
  p_household  uuid,
  p_type       text,
  p_title      text,
  p_body       text default null,
  p_href       text default null,
  p_entity     text default null,
  p_entity_id  uuid default null,
  p_actor      uuid default null,
  p_scheduled  timestamptz default null,
  -- Destinataire unique ; null = tous les parents sauf l'auteur
  p_destinataire uuid default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  t notification_types%rowtype;
  m record;
  n int := 0;
  actif boolean;
begin
  select * into t from notification_types where code = p_type and active;
  if not found then return 0; end if;

  for m in
    select hm.profile_id
    from household_members hm
    join profiles p on p.id = hm.profile_id
    where hm.household_id = p_household
      and hm.deleted_at is null
      and p.deleted_at is null
      -- Un profil provisoire ne peut pas lire ses notifications
      and coalesce(p.is_placeholder, false) = false
      and (p_destinataire is null or hm.profile_id = p_destinataire)
      -- On ne notifie jamais quelqu'un de sa propre action
      and (p_actor is null or hm.profile_id <> p_actor)
  loop
    -- Préférence explicite, ou valeur par défaut du type
    select np.enabled into actif
      from notification_preferences np
     where np.profile_id = m.profile_id
       and np.household_id = p_household
       and np.kind = p_type
       and np.channel = 'internal'::notif_channel;
    if actif is null then actif := t.defaut_actif; end if;
    if not actif then continue; end if;

    insert into notifications (household_id, profile_id, kind, title, body,
                               link_path, entity, entity_id, actor_id, scheduled_at)
    values (p_household, m.profile_id, p_type, p_title, p_body,
            p_href, p_entity, p_entity_id, p_actor, coalesce(p_scheduled, now()));

    n := n + 1;
  end loop;

  return n;
end $$;

-- ---------- 9. Lecture ----------
create or replace function public.mes_notifications(
  p_household uuid, p_limite int default 50, p_non_lues boolean default false
) returns table (
  id uuid, type_code text, type_label text, titre text, corps text,
  href text, entite text, entite_id uuid,
  auteur text, programmee_le timestamptz, lue_le timestamptz, creee_le timestamptz
)
language sql stable security definer set search_path = public as $$
  select n.id, n.kind, t.label, n.title, n.body,
         n.link_path, n.entity, n.entity_id,
         (select p.display_name from profiles p where p.id = n.actor_id),
         n.scheduled_at, n.read_at, n.created_at
  from notifications n
  join notification_types t on t.code = n.kind
  where n.profile_id = auth.uid()
    and n.household_id = p_household
    and public.is_member(p_household)
    -- Un rappel programmé n'apparaît qu'une fois son heure venue
    and n.scheduled_at <= now()
    and (not p_non_lues or n.read_at is null)
  order by n.scheduled_at desc
  limit greatest(1, least(coalesce(p_limite, 50), 200))
$$;

create or replace function public.compter_notifications_non_lues(p_household uuid)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from notifications n
  where n.profile_id = auth.uid()
    and n.household_id = p_household
    and public.is_member(p_household)
    and n.read_at is null
    and n.scheduled_at <= now()
$$;

-- ---------- 10. Marquage ----------
create or replace function public.marquer_notification_lue(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  update notifications set read_at = now()
   where id = p_id and profile_id = auth.uid() and read_at is null;
end $$;

create or replace function public.marquer_tout_lu(p_household uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  update notifications set read_at = now()
   where profile_id = auth.uid() and household_id = p_household
     and read_at is null and scheduled_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- 11. Préférences ----------
create or replace function public.mes_preferences_notifications(p_household uuid)
returns table (
  type_code text, type_label text, description text, categorie text,
  est_rappel boolean, ordre smallint,
  canal text, canal_label text, canal_actif boolean, active boolean
)
language sql stable security definer set search_path = public as $$
  select t.code, t.label, t.description, t.categorie, t.est_rappel, t.sort_order,
         c.code, c.label, c.active,
         coalesce(np.enabled, t.defaut_actif)
  from notification_types t
  cross join notification_channels c
  left join notification_preferences np
    on np.kind = t.code and np.channel::text = c.canal_interne
   and np.profile_id = auth.uid() and np.household_id = p_household
  where t.active and public.is_member(p_household)
  order by t.sort_order, c.sort_order
$$;

create or replace function public.definir_preference_notification(
  p_household uuid, p_type text, p_canal text, p_active boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;
  if not exists (select 1 from notification_types where code = p_type and active) then
    raise exception 'Type de notification inconnu';
  end if;
  if not exists (select 1 from notification_channels where code = p_canal) then
    raise exception 'Canal de notification inconnu';
  end if;

  insert into notification_preferences (profile_id, household_id, kind, channel, enabled)
  values (auth.uid(), p_household, p_type,
          (select c.canal_interne from notification_channels c where c.code = p_canal)::notif_channel,
          p_active)
  on conflict (profile_id, household_id, kind, channel)
  do update set enabled = excluded.enabled, updated_at = now();
end $$;

create or replace function public.mon_delai_rappel(p_household uuid)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select r.minutes_avant from reminder_settings r
      where r.profile_id = auth.uid() and r.household_id = p_household),
    60)
  where public.is_member(p_household)
$$;

create or replace function public.definir_delai_rappel(p_household uuid, p_minutes int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;
  if p_minutes not in (5, 15, 30, 60, 1440) then
    raise exception 'Délai de rappel non pris en charge';
  end if;
  insert into reminder_settings (profile_id, household_id, minutes_avant)
  values (auth.uid(), p_household, p_minutes)
  on conflict (profile_id, household_id)
  do update set minutes_avant = excluded.minutes_avant, updated_at = now();
end $$;

-- ---------- 12. Sécurité ----------
alter table notification_types       enable row level security;
alter table notification_channels    enable row level security;
alter table notification_preferences enable row level security;
alter table reminder_settings        enable row level security;
alter table notifications            enable row level security;
alter table notification_deliveries  enable row level security;
alter table push_subscriptions       enable row level security;

drop policy if exists notif_types_read on notification_types;
create policy notif_types_read on notification_types for select using (active);
drop policy if exists notif_channels_read on notification_channels;
create policy notif_channels_read on notification_channels for select using (true);

-- Une notification n'est lisible que par son destinataire, jamais par l'autre
-- parent : elle peut révéler ce qu'il consulte et quand.
drop policy if exists notif_read on notifications;
create policy notif_read on notifications for select
  using (profile_id = auth.uid());

drop policy if exists notif_pref_read on notification_preferences;
create policy notif_pref_read on notification_preferences for select
  using (profile_id = auth.uid());

drop policy if exists rappel_read on reminder_settings;
create policy rappel_read on reminder_settings for select
  using (profile_id = auth.uid());

drop policy if exists push_read on push_subscriptions;
create policy push_read on push_subscriptions for select
  using (profile_id = auth.uid());

revoke insert, update, delete on notifications, notification_preferences,
  reminder_settings, notification_types, notification_channels,
  notification_deliveries, push_subscriptions
  from public, anon, authenticated;

grant select on notification_types, notification_channels, notifications,
  notification_preferences, reminder_settings to authenticated;

revoke all on function public.notifier(uuid, text, text, text, text, text, uuid, uuid, timestamptz, uuid)
  from public, anon, authenticated;

revoke all on function public.mes_notifications(uuid, int, boolean) from public, anon;
revoke all on function public.compter_notifications_non_lues(uuid) from public, anon;
revoke all on function public.marquer_notification_lue(uuid) from public, anon;
revoke all on function public.marquer_tout_lu(uuid) from public, anon;
revoke all on function public.mes_preferences_notifications(uuid) from public, anon;
revoke all on function public.definir_preference_notification(uuid, text, text, boolean) from public, anon;
revoke all on function public.mon_delai_rappel(uuid) from public, anon;
revoke all on function public.definir_delai_rappel(uuid, int) from public, anon;

grant execute on function public.mes_notifications(uuid, int, boolean) to authenticated;
grant execute on function public.compter_notifications_non_lues(uuid) to authenticated;
grant execute on function public.marquer_notification_lue(uuid) to authenticated;
grant execute on function public.marquer_tout_lu(uuid) to authenticated;
grant execute on function public.mes_preferences_notifications(uuid) to authenticated;
grant execute on function public.definir_preference_notification(uuid, text, text, boolean) to authenticated;
grant execute on function public.mon_delai_rappel(uuid) to authenticated;
grant execute on function public.definir_delai_rappel(uuid, int) to authenticated;

commit;

-- ============================================================
-- DÉCLENCHEURS — les actions du foyer émettent leurs notifications
--
-- Chaque fonction métier prévient l'autre parent de ce qui vient de se passer.
-- L'auteur n'est jamais notifié de sa propre action : notifier(…) l'écarte.
-- ============================================================

-- ---------- Périodes de garde ----------
create or replace function public.create_custody_exception(
  p_household   uuid,
  p_kind        text,
  p_child_ids   uuid[],
  p_parent_id   uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_title       text default null,
  p_note        text default null,
  p_school_year text default null,
  p_source_holiday uuid default null
) returns setof uuid
language plpgsql security definer set search_path = public as $$
declare c uuid; n_children int; rid uuid; libelle text; prenoms text; parent text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;
  perform public.lock_household(p_household);

  select label into libelle from exception_types where code = p_kind and active;
  if libelle is null then
    raise exception 'Type de période inconnu : %', coalesce(p_kind, 'aucun');
  end if;
  if p_starts_at is null or p_ends_at is null then
    raise exception 'Les dates de début et de fin sont requises';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'La fin doit être postérieure au début';
  end if;
  if p_ends_at - p_starts_at > interval '365 days' then
    raise exception 'Une période ne peut pas dépasser un an';
  end if;
  if not public.est_comptable(p_household, p_parent_id) then
    raise exception 'Le parent gardien doit être l''un des deux parents du foyer';
  end if;
  if p_child_ids is null or array_length(p_child_ids, 1) is null then
    raise exception 'Sélectionnez au moins un enfant';
  end if;
  select count(*) into n_children from children
   where id = any(p_child_ids) and household_id = p_household and deleted_at is null;
  if n_children <> array_length(p_child_ids, 1) then
    raise exception 'Un des enfants sélectionnés n''appartient pas à ce foyer';
  end if;
  perform public.exiger_horizon(p_household, p_ends_at::date);

  foreach c in array p_child_ids loop
    begin
      insert into custody_exceptions (household_id, child_id, parent_id, kind,
                                      starts_at, ends_at, title, note, reason,
                                      school_year, source_holiday_id, created_by)
      values (p_household, c, p_parent_id, p_kind, p_starts_at, p_ends_at,
              nullif(trim(p_title), ''), nullif(trim(p_note), ''),
              nullif(trim(p_title), ''), p_school_year, p_source_holiday, auth.uid())
      returning id into rid;
    exception when exclusion_violation then
      raise exception 'Une période « % » existe déjà sur ces dates pour %',
        libelle, (select first_name from children where id = c);
    end;

    insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
    values (p_household, auth.uid(), 'create', 'custody_exception', rid,
            jsonb_build_object('kind', p_kind, 'child_id', c, 'parent_id', p_parent_id,
                               'starts_at', p_starts_at, 'ends_at', p_ends_at));
    return next rid;
  end loop;

  -- Une seule notification pour l'ensemble des enfants concernés : une par
  -- enfant serait répétitive et finirait par être ignorée.
  select string_agg(first_name, ', ' order by first_name) into prenoms
    from children where id = any(p_child_ids);
  select display_name into parent from profiles where id = p_parent_id;

  perform public.notifier(
    p_household, 'event_created',
    format('%s ajoutée', libelle),
    format('%s : du %s au %s, chez %s.', prenoms,
           to_char(p_starts_at, 'DD/MM'), to_char(p_ends_at, 'DD/MM'), parent),
    '/app/planning', 'custody_exception', rid, auth.uid());
end $$;

revoke all on function public.create_custody_exception(uuid, text, uuid[], uuid, timestamptz, timestamptz, text, text, text, uuid) from public, anon;
grant execute on function public.create_custody_exception(uuid, text, uuid[], uuid, timestamptz, timestamptz, text, text, text, uuid) to authenticated;

-- ---------- Suppression d'une période ----------
create or replace function public.delete_custody_exception(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare e custody_exceptions%rowtype; libelle text; prenom text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;

  select * into e from custody_exceptions where id = p_id and deleted_at is null;
  if not found then raise exception 'Cette période n''existe plus'; end if;
  if not public.can_write(e.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;

  update custody_exceptions set deleted_at = now() where id = p_id;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before)
  values (e.household_id, auth.uid(), 'delete', 'custody_exception', p_id,
          jsonb_build_object('kind', e.kind, 'starts_at', e.starts_at, 'ends_at', e.ends_at));

  select label into libelle from exception_types where code = e.kind;
  select first_name into prenom from children where id = e.child_id;

  perform public.notifier(
    e.household_id, 'event_deleted',
    format('%s retirée', coalesce(libelle, 'Période')),
    format('%s : du %s au %s. Le rythme habituel reprend sur ces dates.',
           prenom, to_char(e.starts_at, 'DD/MM'), to_char(e.ends_at, 'DD/MM')),
    '/app/planning', 'custody_exception', p_id, auth.uid());
end $$;

revoke all on function public.delete_custody_exception(uuid) from public, anon;
grant execute on function public.delete_custody_exception(uuid) to authenticated;
