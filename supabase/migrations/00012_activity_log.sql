-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00012 : journal d'activité (lot 1)
--
-- 1. Le journal devient consultable par TOUS les membres du foyer
--    (auparavant réservé au propriétaire, à l'admin et au médiateur).
-- 2. Les actions sur les enfants sont journalisées par TRIGGER — elles
--    passent par des écritures directes, pas par une fonction serveur ;
--    un trigger garantit qu'aucune ne peut échapper au journal.
-- 3. Deux fonctions de lecture : l'historique du foyer et les métadonnées
--    d'historique de chaque dépense (créée / validée / modifiée).
--
-- Le journal reste immuable : aucune policy d'update ni de delete.
-- Idempotent.
-- ============================================================

-- ---------- 1. Lecture du journal par tous les membres ----------
drop policy if exists audit_read on audit_logs;
create policy audit_read on audit_logs for select
  using (household_id is not null and public.is_member(household_id));

-- ---------- 2. Journalisation automatique des enfants ----------
create or replace function public.audit_children() returns trigger
language plpgsql security definer set search_path = public as $$
declare acte text;
begin
  if tg_op = 'INSERT' then
    insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
    values (new.household_id, auth.uid(), 'create', 'child', new.id,
            jsonb_build_object('first_name', new.first_name, 'birth_date', new.birth_date));
    return new;
  end if;

  -- UPDATE : distinguer archivage, suppression logique et modification
  acte := case
    when old.archived_at is null and new.archived_at is not null then 'archive'
    when old.deleted_at is null and new.deleted_at is not null then 'delete'
    else 'update'
  end;

  -- ne rien journaliser si rien de significatif n'a changé
  if acte = 'update'
     and old.first_name is not distinct from new.first_name
     and old.birth_date is not distinct from new.birth_date
     and old.color is not distinct from new.color
     and old.school is not distinct from new.school then
    return new;
  end if;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before, after)
  values (new.household_id, auth.uid(), acte, 'child', new.id,
          jsonb_build_object('first_name', old.first_name, 'birth_date', old.birth_date,
                             'color', old.color, 'school', old.school),
          jsonb_build_object('first_name', new.first_name, 'birth_date', new.birth_date,
                             'color', new.color, 'school', new.school));
  return new;
end $$;

drop trigger if exists trg_audit_children_ins on children;
create trigger trg_audit_children_ins after insert on children
  for each row execute function public.audit_children();

drop trigger if exists trg_audit_children_upd on children;
create trigger trg_audit_children_upd after update on children
  for each row execute function public.audit_children();

-- ---------- 3. Lecture de l'historique du foyer ----------
create or replace function public.list_activity(p_household uuid, p_limit int default 100)
returns table (
  id bigint, created_at timestamptz, actor_id uuid, actor_name text,
  action text, entity text, entity_id uuid, before jsonb, after jsonb
)
language sql stable security definer set search_path = public as $$
  select a.id, a.created_at, a.actor_id,
         coalesce(p.display_name, 'Utilisateur supprimé') as actor_name,
         a.action, a.entity, a.entity_id, a.before, a.after
  from audit_logs a
  left join profiles p on p.id = a.actor_id
  where a.household_id = p_household
    and public.is_member(p_household)   -- contrôle explicite : la fonction est SECURITY DEFINER
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- ---------- 4. Métadonnées d'historique par dépense ----------
-- Une seule requête pour tout le foyer : création, validation, dernière
-- modification, et signalement d'une modification postérieure à la validation.
create or replace function public.expenses_meta(p_household uuid)
returns table (
  expense_id uuid,
  created_at timestamptz,
  validated_at timestamptz,
  last_update_at timestamptz,
  last_update_by uuid,
  last_update_name text,
  modified_after_validation boolean
)
language sql stable security definer set search_path = public as $$
  with maj as (
    select a.entity_id,
           max(a.created_at) as derniere,
           (array_agg(a.actor_id order by a.created_at desc))[1] as auteur,
           bool_or(a.before->>'status' = 'validated') as apres_validation
    from audit_logs a
    where a.household_id = p_household and a.entity = 'expense' and a.action = 'update'
    group by a.entity_id
  ),
  val as (
    select c.expense_id, max(c.created_at) as validee
    from expense_comments c
    join expenses e on e.id = c.expense_id
    where e.household_id = p_household and c.kind = 'validation'
    group by c.expense_id
  )
  select e.id, e.created_at, val.validee, maj.derniere, maj.auteur,
         p.display_name,
         coalesce(maj.apres_validation, false)
  from expenses e
  left join maj on maj.entity_id = e.id
  left join val on val.expense_id = e.id
  left join profiles p on p.id = maj.auteur
  where e.household_id = p_household
    and e.deleted_at is null
    and public.is_member(p_household);
$$;

grant execute on function public.list_activity(uuid, int) to authenticated;
grant execute on function public.expenses_meta(uuid) to authenticated;
