-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00033 : partage d'une période de vacances
--
-- PROBLÈME RÉSOLU
-- Une période de vacances ne pouvait recevoir qu'une seule décision. Or le
-- partage est le cas normal : huit jours chez l'un, huit chez l'autre. En
-- saisissant deux segments, les deux exceptions étaient bien créées mais
-- l'écran les agrégeait en une seule ligne — du premier jour au dernier, avec
-- le parent du premier segment. Le planning devenait faux.
--
-- SOLUTION
-- propositions_vacances renvoie désormais une ligne par SEGMENT, et non plus
-- une ligne par période. Une période sans décision apparaît une fois, avec ses
-- dates officielles ; une période partagée apparaît autant de fois qu'elle
-- compte de segments.
--
-- Le chevauchement reste interdit par la contrainte d'exclusion de 00014 :
-- deux segments ne peuvent pas se recouvrir pour un même enfant.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

drop function if exists public.propositions_vacances(uuid, text);

create or replace function public.propositions_vacances(
  p_household uuid, p_annee text default null
) returns table (
  holiday_id     uuid,
  libelle        text,
  annee_scolaire text,
  debut_officiel date,
  fin_officielle date,
  -- Décision, si ce segment en porte une
  exception_id   uuid,
  parent_id      uuid,
  debut_retenu   timestamptz,
  fin_retenue    timestamptz,
  enfants_couverts int,
  enfants_total  int,
  -- Rang du segment dans sa période, et nombre total de segments : permet à
  -- l'écran d'annoncer « 1 sur 2 » plutôt que de laisser deviner.
  segment        int,
  segments_total int
)
language plpgsql stable security definer set search_path = public as $$
declare zone_foyer text; pays_foyer text; annee text; total int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  select h.school_zone, h.country_code into zone_foyer, pays_foyer
    from households h where h.id = p_household;

  annee := coalesce(p_annee,
    case when extract(month from current_date) >= 8
         then extract(year from current_date)::text || '-' || (extract(year from current_date) + 1)::text
         else (extract(year from current_date) - 1)::text || '-' || extract(year from current_date)::text
    end);

  select count(*) into total from children
   where household_id = p_household and deleted_at is null;

  return query
  with periodes as (
    select sh.id, sh.label, sh.school_year, sh.starts_on, sh.ends_on
    from school_holidays sh
    where sh.source = 'officiel'
      and sh.deleted_at is null
      and sh.country_code = pays_foyer
      and (sh.zone = zone_foyer or sh.zone is null)
      and sh.school_year = annee
  ),
  -- Un segment regroupe les exceptions partageant les mêmes dates et le même
  -- parent : une période saisie pour trois enfants donne trois exceptions,
  -- mais un seul segment aux yeux des parents.
  segments as (
    select ce.source_holiday_id as hid,
           ce.parent_id,
           ce.starts_at,
           ce.ends_at,
           (array_agg(ce.id order by ce.created_at, ce.id))[1] as exception_id,
           count(distinct ce.child_id)::int as enfants
    from custody_exceptions ce
    where ce.household_id = p_household
      and ce.deleted_at is null
      and ce.kind = 'holiday'
      and ce.source_holiday_id is not null
    group by ce.source_holiday_id, ce.parent_id, ce.starts_at, ce.ends_at
  ),
  numerotes as (
    select s.*,
           row_number() over (partition by s.hid order by s.starts_at)::int as rang,
           count(*) over (partition by s.hid)::int as nb
    from segments s
  )
  select p.id, p.label, p.school_year, p.starts_on, p.ends_on,
         n.exception_id, n.parent_id, n.starts_at, n.ends_at,
         coalesce(n.enfants, 0), total,
         coalesce(n.rang, 1), coalesce(n.nb, 0)
  from periodes p
  left join numerotes n on n.hid = p.id
  order by p.starts_on, coalesce(n.starts_at, p.starts_on::timestamptz);
end $$;

revoke all on function public.propositions_vacances(uuid, text) from public, anon;
grant execute on function public.propositions_vacances(uuid, text) to authenticated;

commit;
