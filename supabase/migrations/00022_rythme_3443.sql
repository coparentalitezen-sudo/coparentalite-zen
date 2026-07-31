-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00022 : rythme 3-4-4-3
--
-- Ajoute le cycle 3-4-4-3 au catalogue des rythmes : trois jours chez un
-- parent, quatre chez l'autre, puis l'inverse la semaine suivante. Chaque
-- parent retrouve ainsi les mêmes jours de semaine une semaine sur deux, ce
-- qui simplifie l'organisation scolaire et professionnelle.
--
-- ATTENTION : l'ajout d'une valeur à un type énuméré ne peut pas être suivi
-- de son utilisation dans la même transaction. Cette migration n'est donc pas
-- encadrée par begin/commit — elle se limite à une seule instruction, sans
-- risque d'état intermédiaire.
-- ============================================================

alter type custody_pattern add value if not exists 'p3443';

-- ============================================================
-- Cycle personnalisé transmis au serveur
--
-- Le rythme « personnalisé » laisse les parents définir eux-mêmes la
-- répartition sur un à quatre semaines. Ce cycle doit être stocké : sans lui,
-- le rythme est inutilisable au rechargement.
--
-- Il rejoint la colonne config, déjà employée pour le second parent.
-- ============================================================

-- La signature gagne le cycle personnalisé. L'ancienne doit disparaître :
-- deux surcharges rendraient l'appel ambigu.
drop function if exists public.set_custody_rule(
  uuid, custody_pattern, date, uuid, uuid, time, text);

create or replace function public.set_custody_rule(
  p_household   uuid,
  p_pattern     custody_pattern,
  p_start_date  date,
  p_parent1     uuid,
  p_parent2     uuid,
  p_handover_time time default null,
  p_handover_place text default null,
  p_custom_cycle jsonb default null
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
                             handover_time, handover_place, config, created_by)
  values (p_household, p_pattern, p_start_date, p_parent1,
          p_handover_time, p_handover_place,
          jsonb_build_object('parent2', p_parent2)
            || case when p_custom_cycle is not null
                    then jsonb_build_object('custom_cycle', p_custom_cycle)
                    else '{}'::jsonb end,
          auth.uid())
  returning id into rid;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
  values (p_household, auth.uid(), 'set', 'custody_rule', rid,
          jsonb_build_object('pattern', p_pattern, 'start_date', p_start_date));
  return rid;
end $$;

revoke all on function public.set_custody_rule(uuid, custody_pattern, date, uuid, uuid, time, text, jsonb) from public, anon;
grant execute on function public.set_custody_rule(uuid, custody_pattern, date, uuid, uuid, time, text, jsonb) to authenticated;
