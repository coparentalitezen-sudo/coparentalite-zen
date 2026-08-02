-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00036 : jour du changement
--
-- BESOIN
-- Le changement de parent n'a pas lieu le lundi dans toutes les familles.
-- Le vendredi est même fréquent : les enfants partent après l'école et le
-- week-end ouvre la semaine de garde. Jusqu'ici, le rythme « une semaine sur
-- deux » basculait au jour de la date de début, et les semaines paires et
-- impaires suivaient rigoureusement le lundi du calendrier.
--
-- SOLUTION
-- La colonne handover_day existe depuis la migration 00001 mais n'était pas
-- alimentée : set_custody_rule l'accepte désormais. 0 = dimanche … 6 = samedi,
-- convention de PostgreSQL (extract(dow)) et de JavaScript (getUTCDay), pour
-- qu'aucune conversion ne se glisse entre la base et le moteur.
--
-- null conserve le comportement antérieur — le lundi — si bien que les règles
-- déjà enregistrées gardent exactement le planning qu'elles produisaient.
--
-- Le moteur ne l'applique qu'aux rythmes hebdomadaires : 2-2-3, 2-2-5-5 et
-- 3-4-4-3 nomment déjà chaque journée de leur cycle, et le rythme
-- personnalisé se dessine jour par jour.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- La colonne est présente depuis 00001 ; ce filet couvre une base qui aurait
-- été créée à partir d'un instantané plus ancien.
alter table custody_rules
  add column if not exists handover_day smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'custody_rules'::regclass and conname = 'custody_rules_handover_day_check'
  ) then
    alter table custody_rules
      add constraint custody_rules_handover_day_check
      check (handover_day is null or handover_day between 0 and 6);
  end if;
end $$;

-- L'ancienne signature disparaît : deux fonctions de même nom dont l'une
-- accepte un argument de plus rendraient l'appel ambigu côté PostgREST.
drop function if exists public.set_custody_rule(
  uuid, custody_pattern, date, uuid, uuid, time, text, jsonb);

create or replace function public.set_custody_rule(
  p_household   uuid,
  p_pattern     custody_pattern,
  p_start_date  date,
  p_parent1     uuid,
  p_parent2     uuid,
  p_handover_time time default null,
  p_handover_place text default null,
  p_custom_cycle jsonb default null,
  p_handover_day smallint default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; n int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;
  perform public.lock_household(p_household);
  if p_parent1 = p_parent2 then
    raise exception 'Les deux parents doivent être différents';
  end if;
  if not public.est_comptable(p_household, p_parent1)
     or not public.est_comptable(p_household, p_parent2) then
    raise exception 'Les parents indiqués doivent être les deux parents du foyer';
  end if;
  perform public.exiger_horizon(p_household, p_start_date);

  if p_handover_day is not null and (p_handover_day < 0 or p_handover_day > 6) then
    raise exception 'Le jour du changement doit désigner un jour de la semaine';
  end if;

  -- Un cycle personnalisé doit couvrir des semaines entières et nommer les
  -- deux parents : sans quoi l'un d'eux n'aurait jamais les enfants.
  if p_pattern = 'custom' then
    if p_custom_cycle is null or jsonb_array_length(p_custom_cycle) = 0 then
      raise exception 'Définissez la répartition de votre cycle personnalisé';
    end if;
    n := jsonb_array_length(p_custom_cycle);
    if n % 7 <> 0 then
      raise exception 'Le cycle doit couvrir des semaines entières';
    end if;
    if n > 28 then
      raise exception 'Le cycle ne peut pas dépasser quatre semaines';
    end if;
    if not (p_custom_cycle @> '["P1"]'::jsonb and p_custom_cycle @> '["P2"]'::jsonb) then
      raise exception 'Chaque parent doit avoir au moins un jour de garde';
    end if;
  end if;

  update custody_rules set deleted_at = now()
  where household_id = p_household and deleted_at is null;

  insert into custody_rules (household_id, pattern, start_date, starting_parent,
                             handover_time, handover_day, handover_place, config, created_by)
  values (p_household, p_pattern, p_start_date, p_parent1,
          p_handover_time, p_handover_day, p_handover_place,
          jsonb_build_object('parent2', p_parent2)
            || case when p_custom_cycle is not null
                    then jsonb_build_object('custom_cycle', p_custom_cycle)
                    else '{}'::jsonb end,
          auth.uid())
  returning id into rid;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
  values (p_household, auth.uid(), 'set', 'custody_rule', rid,
          jsonb_build_object('pattern', p_pattern, 'start_date', p_start_date,
                             'handover_day', p_handover_day));
  return rid;
end $$;

revoke all on function public.set_custody_rule(
  uuid, custody_pattern, date, uuid, uuid, time, text, jsonb, smallint) from public, anon;
grant execute on function public.set_custody_rule(
  uuid, custody_pattern, date, uuid, uuid, time, text, jsonb, smallint) to authenticated;

commit;
