-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00021 : moteur générique d'exceptions
--
-- PRINCIPE
-- Une exception de planning est une période pendant laquelle un parent
-- déterminé a les enfants, en dérogation au rythme récurrent. Ce qui distingue
-- une vacance d'un échange de week-end n'est pas sa nature technique — c'est
-- son intitulé et son rang de priorité.
--
-- Le type d'exception devient donc une simple ligne de référence, avec son
-- libellé, son icône, sa couleur et sa priorité. Ajouter « garde alternée
-- exceptionnelle », « stage sportif » ou « hospitalisation » ne demandera
-- aucune migration : une ligne suffit.
--
-- PRIORITÉS
-- Toute exception prime sur le rythme récurrent. Entre exceptions, le rang
-- départage — le plus élevé l'emporte :
--     absence exceptionnelle (50) > voyage (40) > vacances scolaires (30)
--   > échange de week-end (20) > changement ponctuel (10)
-- Une hospitalisation doit primer sur des vacances planifiées ; des billets
-- pris priment sur un échange de week-end convenu de longue date.
--
-- À la fin d'une exception, le rythme reprend sur son calendrier d'origine :
-- une exception masque, elle ne décale jamais.
--
-- Idempotente, transactionnelle, sans perte : les exceptions existantes
-- conservent leur type et leurs dates.
-- ============================================================

begin;

-- ---------- 1. Catalogue des types ----------
create table if not exists exception_types (
  code         text primary key,
  label        text not null,
  label_plural text,
  -- Rang de priorité : le plus élevé l'emporte en cas de recouvrement
  priority     smallint not null,
  icon         text,                       -- nom d'icône côté application
  color        text,                       -- teinte d'accent, format hexadécimal
  description  text,
  -- Une exception issue du calendrier officiel se pré-remplit ; les autres
  -- se saisissent librement.
  from_official_calendar boolean not null default false,
  active       boolean not null default true,
  sort_order   smallint not null default 100,
  created_at   timestamptz not null default now()
);

insert into exception_types
  (code, label, label_plural, priority, icon, color, description,
   from_official_calendar, sort_order)
values
  ('swap', 'Changement ponctuel', 'Changements ponctuels', 10, 'echange', '#4E6381',
   'Une journée ou quelques jours échangés entre les parents.', false, 10),
  ('weekend', 'Échange de week-end', 'Échanges de week-end', 20, 'echange', '#6741B8',
   'Un week-end permuté avec l''autre parent.', false, 20),
  ('holiday', 'Vacances scolaires', 'Vacances scolaires', 30, 'soleil', '#C9A227',
   'Une période de vacances, pré-remplie depuis le calendrier officiel.', true, 30),
  ('travel', 'Voyage', 'Voyages', 40, 'avion', '#2C5FA8',
   'Un séjour hors du domicile habituel.', false, 40),
  ('absence', 'Absence exceptionnelle', 'Absences exceptionnelles', 50, 'alerte', '#B3423A',
   'Un imprévu qui empêche un parent d''accueillir les enfants.', false, 50)
on conflict (code) do update set
  label = excluded.label,
  label_plural = excluded.label_plural,
  priority = excluded.priority,
  icon = excluded.icon,
  color = excluded.color,
  description = excluded.description,
  from_official_calendar = excluded.from_official_calendar,
  sort_order = excluded.sort_order;

-- ---------- 2. Rattachement des exceptions existantes ----------
-- La colonne kind portait déjà 'holiday' ou 'swap' : les valeurs restent
-- valides, on les relie simplement au catalogue.
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'custody_exceptions_kind_fk') then
    -- L'ancienne contrainte de valeurs figées cède la place au catalogue
    alter table custody_exceptions drop constraint if exists custody_exceptions_kind_check;
    alter table custody_exceptions
      add constraint custody_exceptions_kind_fk
      foreign key (kind) references exception_types(code);
  end if;
end $$;

-- Rattachement facultatif à une période officielle : permet de savoir qu'une
-- exception a été proposée depuis le calendrier, et de la retrouver.
alter table custody_exceptions add column if not exists source_holiday_id uuid
  references school_holidays(id);
alter table custody_exceptions add column if not exists school_year text;

create index if not exists idx_cex_type
  on custody_exceptions (household_id, kind, starts_at) where deleted_at is null;

-- ---------- 3. Chevauchement ----------
-- Deux exceptions DU MÊME TYPE ne peuvent se recouvrir pour un même enfant :
-- ce serait une contradiction. Deux types différents le peuvent, la priorité
-- tranchant sans ambiguïté.
-- (La contrainte de 00014 porte déjà sur (child_id, kind, période) : elle
--  reste exactement adaptée.)

-- ---------- 4. Lecture du catalogue ----------
create or replace function public.types_exception()
returns table (
  code text, libelle text, libelle_pluriel text, priorite smallint,
  icone text, couleur text, description text,
  depuis_calendrier boolean, ordre smallint
)
language sql stable security definer set search_path = public as $$
  select t.code, t.label, coalesce(t.label_plural, t.label), t.priority,
         t.icon, t.color, t.description, t.from_official_calendar, t.sort_order
  from exception_types t
  where t.active
  order by t.sort_order
$$;

revoke all on function public.types_exception() from public, anon;
grant execute on function public.types_exception() to authenticated;

-- ---------- 5. Lecture enrichie des exceptions ----------
-- La priorité accompagne chaque exception : le moteur d'affichage n'a plus à
-- connaître les types, il applique simplement l'ordre reçu.
drop function if exists public.list_custody_exceptions(uuid, date, date);

create or replace function public.list_custody_exceptions(
  p_household uuid, p_from date, p_to date
) returns table (
  id uuid, kind text, kind_label text, priorite smallint,
  icone text, couleur text,
  child_id uuid, child_name text,
  parent_id uuid, starts_at timestamptz, ends_at timestamptz,
  title text, note text, school_year text,
  created_by uuid, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.kind, t.label, t.priority, t.icon, t.color,
         e.child_id, c.first_name, e.parent_id, e.starts_at, e.ends_at,
         e.title, e.note, e.school_year,
         e.created_by, e.created_at, e.updated_at
  from custody_exceptions e
  join children c on c.id = e.child_id
  left join exception_types t on t.code = e.kind
  where e.household_id = p_household
    and e.deleted_at is null
    and public.is_member(p_household)
    and e.ends_at   >= (p_from::timestamptz)
    and e.starts_at <  ((p_to + 1)::timestamptz)
  order by t.priority, e.starts_at, c.first_name
$$;

revoke all on function public.list_custody_exceptions(uuid, date, date) from public, anon;
grant execute on function public.list_custody_exceptions(uuid, date, date) to authenticated;

-- ---------- 6. Création : le type vient du catalogue ----------
-- La signature gagne deux paramètres (année scolaire et période officielle
-- d'origine). L'ancienne doit disparaître : deux surcharges rendraient l'appel
-- ambigu et PostgreSQL refuserait de trancher.
drop function if exists public.create_custody_exception(
  uuid, text, uuid[], uuid, timestamptz, timestamptz, text, text);

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
declare c uuid; n_children int; rid uuid; libelle text;
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
end $$;

revoke all on function public.create_custody_exception(uuid, text, uuid[], uuid, timestamptz, timestamptz, text, text, text, uuid) from public, anon;
grant execute on function public.create_custody_exception(uuid, text, uuid[], uuid, timestamptz, timestamptz, text, text, text, uuid) to authenticated;

-- ---------- 7. Propositions de vacances ----------
-- Les périodes officielles de l'année scolaire, accompagnées de ce que les
-- parents en ont déjà décidé. Ce sont des PROPOSITIONS : les dates comme le
-- parent gardien restent librement modifiables.
create or replace function public.propositions_vacances(
  p_household uuid, p_annee text default null
) returns table (
  holiday_id     uuid,
  libelle        text,
  annee_scolaire text,
  debut_officiel date,
  fin_officielle date,
  -- Décision des parents, si elle existe déjà
  exception_id   uuid,
  parent_id      uuid,
  debut_retenu   timestamptz,
  fin_retenue    timestamptz,
  enfants_couverts int,
  enfants_total  int
)
language plpgsql stable security definer set search_path = public as $$
declare zone_foyer text; pays_foyer text; annee text; total int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  select h.school_zone, h.country_code into zone_foyer, pays_foyer
    from households h where h.id = p_household;

  -- Année scolaire courante : elle bascule au 1er août
  annee := coalesce(p_annee,
    case when extract(month from current_date) >= 8
         then extract(year from current_date)::text || '-' || (extract(year from current_date) + 1)::text
         else (extract(year from current_date) - 1)::text || '-' || extract(year from current_date)::text
    end);

  select count(*) into total from children
   where household_id = p_household and deleted_at is null;

  return query
  select sh.id, sh.label, sh.school_year, sh.starts_on, sh.ends_on,
         d.exception_id, d.parent_id, d.debut, d.fin,
         coalesce(d.enfants, 0)::int, total
  from school_holidays sh
  left join lateral (
    select min(ce.id) as exception_id,
           min(ce.parent_id::text)::uuid as parent_id,
           min(ce.starts_at) as debut,
           max(ce.ends_at) as fin,
           count(distinct ce.child_id) as enfants
    from custody_exceptions ce
    where ce.household_id = p_household
      and ce.deleted_at is null
      and ce.kind = 'holiday'
      and ce.source_holiday_id = sh.id
  ) d on true
  where sh.source = 'officiel'
    and sh.deleted_at is null
    and sh.country_code = pays_foyer
    and (sh.zone = zone_foyer or sh.zone is null)
    and sh.school_year = annee
  order by sh.starts_on;
end $$;

revoke all on function public.propositions_vacances(uuid, text) from public, anon;
grant execute on function public.propositions_vacances(uuid, text) to authenticated;

-- ---------- 8. Droits ----------
alter table exception_types enable row level security;
drop policy if exists exception_types_read on exception_types;
create policy exception_types_read on exception_types for select using (active);

revoke insert, update, delete on exception_types from public, anon, authenticated;
grant select on exception_types to authenticated;

commit;
