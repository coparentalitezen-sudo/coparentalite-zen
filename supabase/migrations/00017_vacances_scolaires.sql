-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00017 : vacances scolaires automatiques
--
-- PRINCIPE
-- Le foyer choisit sa zone académique (A, B ou C). À partir de là, plus aucune
-- saisie : les vacances sont importées depuis le calendrier officiel du
-- ministère de l'Éducation nationale et rendues disponibles au planning.
--
-- SOURCE : data.education.gouv.fr, jeu « fr-en-calendrier-scolaire ».
-- C'est la source officielle ; on ne devine jamais une date. Si l'import n'a
-- pas encore eu lieu, l'application le dit au lieu d'afficher des vacances
-- approximatives — une date fausse dans un planning de garde, c'est un enfant
-- qui attend devant une école.
--
-- LES EXCEPTIONS DES PARENTS SONT INTOUCHABLES
-- Les vacances importées ne sont qu'une couche d'information. La priorité du
-- planning reste : exception parentale « vacances » > changement ponctuel >
-- rythme récurrent. Changer de zone ne supprime jamais une décision prise par
-- les parents.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Calendrier officiel, partagé par tous les foyers ----------
-- La table school_holidays existait avec un household_id : elle servait à des
-- vacances saisies à la main. On la complète pour accueillir un calendrier
-- national, identifié par zone et année scolaire, sans household_id.
alter table school_holidays add column if not exists source text not null default 'manuel';
alter table school_holidays add column if not exists external_id text;
alter table school_holidays add column if not exists population text;
alter table school_holidays add column if not exists imported_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'school_holidays_source_check') then
    alter table school_holidays add constraint school_holidays_source_check
      check (source in ('manuel', 'officiel'));
  end if;
end $$;

-- Une même période officielle ne doit exister qu'une fois par zone
create unique index if not exists uq_school_holidays_officiel
  on school_holidays (zone, school_year, label, starts_on)
  where source = 'officiel';

create index if not exists idx_school_holidays_zone
  on school_holidays (zone, starts_on, ends_on) where source = 'officiel';

-- ---------- 2. Suivi des imports ----------
create table if not exists school_calendar_syncs (
  id            bigint generated always as identity primary key,
  zone          text,
  school_year   text,
  periodes      int not null default 0,
  statut        text not null check (statut in ('succes', 'echec')),
  message       text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists idx_sync_recent on school_calendar_syncs (started_at desc);

-- ---------- 3. Zone du foyer ----------
-- La colonne school_zone existe depuis 00001. On journalise son changement
-- pour pouvoir expliquer un planning qui se modifie.
create or replace function public.set_school_zone(p_household uuid, p_zone text)
returns void
language plpgsql security definer set search_path = public as $$
declare ancienne text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  if p_zone is not null and p_zone not in ('A', 'B', 'C') then
    raise exception 'Zone académique inconnue : choisissez A, B ou C';
  end if;

  select h.school_zone into ancienne from households h where h.id = p_household;
  update households set school_zone = p_zone, updated_at = now()
   where id = p_household and deleted_at is null;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before, after)
  values (p_household, auth.uid(), 'set', 'school_zone', p_household,
          jsonb_build_object('zone', ancienne),
          jsonb_build_object('zone', p_zone));
end $$;

-- ---------- 4. Lecture : vacances applicables au foyer ----------
-- Renvoie les périodes officielles de la zone du foyer sur une plage donnée.
-- Aucun calcul de garde ici : le moteur de planning décide qui a les enfants,
-- cette fonction dit seulement quand se situent les vacances.
create or replace function public.list_school_holidays(
  p_household uuid, p_from date, p_to date
) returns table (
  id uuid, libelle text, zone text, annee_scolaire text,
  debut date, fin date, source text
)
language sql stable security definer set search_path = public as $$
  select h.id, h.label, h.zone, h.school_year, h.starts_on, h.ends_on, h.source
  from school_holidays h
  where public.is_member(p_household)
    and h.deleted_at is null
    and (
      -- calendrier officiel de la zone choisie par le foyer
      (h.source = 'officiel'
       and h.zone = (select hh.school_zone from households hh where hh.id = p_household))
      -- ou périodes propres au foyer, si d'anciennes saisies existent
      or h.household_id = p_household
    )
    and h.ends_on   >= p_from
    and h.starts_on <= p_to
  order by h.starts_on
$$;

-- ---------- 5. État de la synchronisation, pour informer sans mentir ----------
create or replace function public.school_calendar_state(p_household uuid)
returns table (
  zone            text,
  periodes        int,
  premiere_date   date,
  derniere_date   date,
  derniere_sync   timestamptz,
  couvre_un_an    boolean
)
language plpgsql stable security definer set search_path = public as $$
declare z text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  select hh.school_zone into z from households hh where hh.id = p_household;

  return query
  select z,
         count(*)::int,
         min(h.starts_on),
         max(h.ends_on),
         (select max(s.finished_at) from school_calendar_syncs s
           where s.statut = 'succes' and (s.zone = z or s.zone is null)),
         coalesce(max(h.ends_on) >= current_date + 365, false)
  from school_holidays h
  where h.source = 'officiel' and h.zone = z and h.deleted_at is null;
end $$;

-- ---------- 6. Import : réservé au rôle de service ----------
-- Le calendrier officiel est national : un utilisateur ne doit pas pouvoir
-- le modifier, sinon il altérerait les vacances de tous les foyers.
create or replace function public.import_school_holidays(p_periodes jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare p jsonb; n int := 0;
begin
  if p_periodes is null or jsonb_array_length(p_periodes) = 0 then
    raise exception 'Aucune période à importer';
  end if;

  for p in select * from jsonb_array_elements(p_periodes) loop
    if (p->>'zone') not in ('A', 'B', 'C') then
      continue;   -- zones hors métropole ignorées, faute de public concerné
    end if;
    if (p->>'starts_on') is null or (p->>'ends_on') is null then
      continue;
    end if;

    insert into school_holidays (label, zone, school_year, starts_on, ends_on,
                                 source, external_id, population, imported_at)
    values (p->>'label', p->>'zone', p->>'school_year',
            (p->>'starts_on')::date, (p->>'ends_on')::date,
            'officiel', p->>'external_id', p->>'population', now())
    on conflict (zone, school_year, label, starts_on) where source = 'officiel'
    do update set ends_on = excluded.ends_on,
                  population = excluded.population,
                  imported_at = now(),
                  deleted_at = null;
    n := n + 1;
  end loop;

  return n;
end $$;

create or replace function public.log_calendar_sync(
  p_zone text, p_annee text, p_periodes int, p_statut text, p_message text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into school_calendar_syncs (zone, school_year, periodes, statut, message, finished_at)
  values (p_zone, p_annee, coalesce(p_periodes, 0), p_statut, left(p_message, 500), now());
end $$;

-- ---------- 7. Droits ----------
alter table school_calendar_syncs enable row level security;
drop policy if exists sync_read on school_calendar_syncs;
create policy sync_read on school_calendar_syncs for select using (auth.uid() is not null);

revoke insert, update, delete on school_calendar_syncs from public, anon, authenticated;
revoke insert, update, delete on school_holidays from public, anon, authenticated;
grant select on school_calendar_syncs, school_holidays to authenticated;

revoke all on function public.import_school_holidays(jsonb) from public, anon, authenticated;
revoke all on function public.log_calendar_sync(text, text, int, text, text) from public, anon, authenticated;
revoke all on function public.set_school_zone(uuid, text) from public, anon;
revoke all on function public.list_school_holidays(uuid, date, date) from public, anon;
revoke all on function public.school_calendar_state(uuid) from public, anon;

grant execute on function public.set_school_zone(uuid, text) to authenticated;
grant execute on function public.list_school_holidays(uuid, date, date) to authenticated;
grant execute on function public.school_calendar_state(uuid) to authenticated;

commit;
