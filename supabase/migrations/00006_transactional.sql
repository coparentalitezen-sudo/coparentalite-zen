-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00006 : opérations transactionnelles
-- Une dépense = 3 écritures (dépense, enfants, parts). Les faire en
-- 3 appels séparés depuis le client peut laisser une dépense orpheline
-- si l'une échoue. Cette fonction fait tout dans UNE transaction, avec
-- validation serveur des invariants monétaires.
-- Idempotent : create or replace uniquement.
-- ============================================================

create or replace function public.create_expense_full(
  p_household   uuid,
  p_title       text,
  p_amount_cents bigint,
  p_spent_on    date,
  p_category_id uuid,
  p_paid_by     uuid,
  p_child_ids   uuid[],
  p_shares      jsonb          -- [{"parent_id":"...","owed_cents":1234,"basis_points":5000}]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
  total bigint := 0;
  part jsonb;
  n_children int;
begin
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à ajouter une dépense dans ce foyer';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Le titre de la dépense est requis';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Le montant doit être strictement positif';
  end if;

  -- le payeur doit être membre du foyer
  if not exists (select 1 from household_members
                 where household_id = p_household and profile_id = p_paid_by and deleted_at is null) then
    raise exception 'Le parent payeur n''appartient pas à ce foyer';
  end if;

  -- les enfants doivent appartenir au foyer
  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    select count(*) into n_children from children
    where id = any(p_child_ids) and household_id = p_household and deleted_at is null;
    if n_children <> array_length(p_child_ids, 1) then
      raise exception 'Un des enfants sélectionnés n''appartient pas à ce foyer';
    end if;
  end if;

  -- invariant monétaire : la somme des parts doit égaler exactement le montant
  for part in select * from jsonb_array_elements(p_shares) loop
    if (part->>'owed_cents')::bigint < 0 then
      raise exception 'Une part négative est interdite';
    end if;
    if not exists (select 1 from household_members
                   where household_id = p_household
                     and profile_id = (part->>'parent_id')::uuid and deleted_at is null) then
      raise exception 'Une des parts vise un parent extérieur au foyer';
    end if;
    total := total + (part->>'owed_cents')::bigint;
  end loop;
  if total <> p_amount_cents then
    raise exception 'Somme des parts (%) différente du montant total (%)', total, p_amount_cents;
  end if;

  insert into expenses (household_id, title, amount_cents, spent_on, category_id,
                        paid_by, status, created_by)
  values (p_household, trim(p_title), p_amount_cents, p_spent_on, p_category_id,
          p_paid_by, 'sent', auth.uid())
  returning id into eid;

  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    insert into expense_children (expense_id, child_id)
    select eid, unnest(p_child_ids);
  end if;

  insert into expense_shares (expense_id, parent_id, kind, basis_points, owed_cents)
  select eid, (s->>'parent_id')::uuid, 'percentage',
         nullif(s->>'basis_points','')::int, (s->>'owed_cents')::bigint
  from jsonb_array_elements(p_shares) s;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (p_household, auth.uid(), 'create', 'expense', eid);

  return eid;   -- toute exception ci-dessus annule l'intégralité de l'insertion
end $$;

-- ---------- Validation / contestation d'une dépense par le second parent ----------
create or replace function public.review_expense(
  p_expense uuid,
  p_action  text,               -- 'validate' | 'dispute' | 'clarify'
  p_comment text default null,
  p_accepted_cents bigint default null
) returns void
language plpgsql security definer set search_path = public as $$
declare hid uuid; payer uuid;
begin
  select household_id, paid_by into hid, payer from expenses where id = p_expense and deleted_at is null;
  if hid is null then raise exception 'Dépense introuvable'; end if;
  if not public.can_write(hid) then raise exception 'Action non autorisée'; end if;
  if payer = auth.uid() then
    raise exception 'La dépense doit être validée par l''autre parent';
  end if;

  insert into expense_comments (expense_id, author_id, kind, body, accepted_cents)
  values (p_expense, auth.uid(),
          case p_action when 'validate' then 'validation'
                        when 'dispute' then 'dispute'
                        else 'clarification_request' end,
          p_comment, p_accepted_cents);

  update expenses set status = case p_action
      when 'validate' then 'validated'::expense_status
      when 'dispute'  then 'disputed'::expense_status
      else 'to_validate'::expense_status end
  where id = p_expense;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (hid, auth.uid(), p_action, 'expense', p_expense);
end $$;

-- ---------- Définition du rythme de garde (une règle active par foyer) ----------
create or replace function public.set_custody_rule(
  p_household   uuid,
  p_pattern     custody_pattern,
  p_start_date  date,
  p_parent1     uuid,
  p_parent2     uuid,
  p_handover_time time default null,
  p_handover_place text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;
  if p_parent1 = p_parent2 then
    raise exception 'Les deux parents doivent être différents';
  end if;
  if not exists (select 1 from household_members
                 where household_id = p_household and profile_id = p_parent1 and deleted_at is null)
     or not exists (select 1 from household_members
                 where household_id = p_household and profile_id = p_parent2 and deleted_at is null) then
    raise exception 'Les parents indiqués doivent être membres du foyer';
  end if;

  -- une seule règle active : les précédentes sont archivées
  update custody_rules set deleted_at = now()
  where household_id = p_household and deleted_at is null;

  insert into custody_rules (household_id, pattern, start_date, starting_parent,
                             handover_time, handover_place, config, created_by)
  values (p_household, p_pattern, p_start_date, p_parent1,
          p_handover_time, p_handover_place,
          jsonb_build_object('parent2', p_parent2), auth.uid())
  returning id into rid;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (p_household, auth.uid(), 'set', 'custody_rule', rid);
  return rid;
end $$;

grant execute on function public.create_expense_full(uuid, text, bigint, date, uuid, uuid, uuid[], jsonb) to authenticated;
grant execute on function public.review_expense(uuid, text, text, bigint) to authenticated;
grant execute on function public.set_custody_rule(uuid, custody_pattern, date, uuid, uuid, time, text) to authenticated;
