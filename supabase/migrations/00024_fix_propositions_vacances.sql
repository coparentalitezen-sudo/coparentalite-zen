-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00024 : correction de propositions_vacances
--
-- DÉFAUT CORRIGÉ
-- La fonction employait min(ce.id) sur une colonne uuid. PostgreSQL ne définit
-- pas min() pour ce type : l'écran Vacances échouait entièrement, sur
-- « function min(uuid) does not exist ».
--
-- Ce défaut est passé parce qu'aucun test ne couvrait cette fonction — elle a
-- été livrée sans jamais avoir été exécutée. La migration s'accompagne donc de
-- tests qui l'appellent réellement, dans ses différents cas.
--
-- Le regroupement s'appuie désormais sur array_agg, qui accepte tous les
-- types, avec un ordre explicite : la décision la plus ancienne fait foi.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

create or replace function public.propositions_vacances(
  p_household uuid, p_annee text default null
) returns table (
  holiday_id     uuid,
  libelle        text,
  annee_scolaire text,
  debut_officiel date,
  fin_officielle date,
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

  -- L'année scolaire bascule au 1er août
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
    -- array_agg accepte les uuid, contrairement à min() : la décision la plus
    -- ancienne fait foi, ce qui reste stable d'un appel à l'autre.
    select (array_agg(ce.id        order by ce.created_at, ce.id))[1] as exception_id,
           (array_agg(ce.parent_id order by ce.created_at, ce.id))[1] as parent_id,
           min(ce.starts_at) as debut,
           max(ce.ends_at)   as fin,
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

commit;
