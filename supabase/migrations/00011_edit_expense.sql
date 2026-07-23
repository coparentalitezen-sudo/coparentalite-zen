-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00011 : modification / suppression d'une dépense
--
-- Enjeu d'intégrité : modifier une dépense DÉJÀ VALIDÉE change le solde
-- rétroactivement, sans que l'autre parent ne l'ait accepté. La règle
-- retenue est donc : toute modification remet la dépense « en attente de
-- réponse » (statut 'sent') — l'autre parent doit la valider à nouveau.
--
-- Autorisation : le parent qui a payé, ou celui qui a saisi la dépense.
-- L'autre parent valide ou conteste, il ne modifie pas.
--
-- Traçabilité : audit_logs conserve l'avant et l'après (montant, titre,
-- date). Suppression LOGIQUE uniquement.
-- Idempotent : create or replace.
-- ============================================================

create or replace function public.update_expense(
  p_expense      uuid,
  p_title        text,
  p_amount_cents bigint,
  p_spent_on     date,
  p_category_id  uuid,
  p_child_ids    uuid[],
  p_shares       jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  e        expenses%rowtype;
  total    bigint := 0;
  part     jsonb;
  n_children int;
begin
  select * into e from expenses where id = p_expense and deleted_at is null for update;
  if not found then raise exception 'Dépense introuvable'; end if;
  if not public.can_write(e.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier cette dépense';
  end if;
  if auth.uid() <> e.paid_by and auth.uid() <> e.created_by then
    raise exception 'Seul le parent qui a payé cette dépense peut la modifier';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Le titre de la dépense est requis';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Le montant doit être strictement positif';
  end if;

  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    select count(*) into n_children from children
    where id = any(p_child_ids) and household_id = e.household_id and deleted_at is null;
    if n_children <> array_length(p_child_ids, 1) then
      raise exception 'Un des enfants sélectionnés n''appartient pas à ce foyer';
    end if;
  end if;

  for part in select * from jsonb_array_elements(p_shares) loop
    if (part->>'owed_cents')::bigint < 0 then
      raise exception 'Une part négative est interdite';
    end if;
    if not exists (select 1 from household_members
                   where household_id = e.household_id
                     and profile_id = (part->>'parent_id')::uuid and deleted_at is null) then
      raise exception 'Une des parts vise un parent extérieur au foyer';
    end if;
    total := total + (part->>'owed_cents')::bigint;
  end loop;
  if total <> p_amount_cents then
    raise exception 'Somme des parts (%) différente du montant total (%)', total, p_amount_cents;
  end if;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before, after)
  values (e.household_id, auth.uid(), 'update', 'expense', p_expense,
          jsonb_build_object('title', e.title, 'amount_cents', e.amount_cents,
                             'spent_on', e.spent_on, 'status', e.status),
          jsonb_build_object('title', trim(p_title), 'amount_cents', p_amount_cents,
                             'spent_on', p_spent_on, 'status', 'sent'));

  update expenses
     set title = trim(p_title),
         amount_cents = p_amount_cents,
         spent_on = coalesce(p_spent_on, e.spent_on),
         category_id = p_category_id,
         status = 'sent'          -- toute modification annule la validation précédente
   where id = p_expense;

  delete from expense_children where expense_id = p_expense;
  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    insert into expense_children (expense_id, child_id) select p_expense, unnest(p_child_ids);
  end if;

  delete from expense_shares where expense_id = p_expense;
  insert into expense_shares (expense_id, parent_id, kind, basis_points, owed_cents)
  select p_expense, (s->>'parent_id')::uuid, 'percentage',
         nullif(s->>'basis_points','')::int, (s->>'owed_cents')::bigint
  from jsonb_array_elements(p_shares) s;
end $$;

create or replace function public.delete_expense(p_expense uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype;
begin
  select * into e from expenses where id = p_expense and deleted_at is null for update;
  if not found then raise exception 'Dépense introuvable ou déjà supprimée'; end if;
  if not public.can_write(e.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  if auth.uid() <> e.paid_by and auth.uid() <> e.created_by then
    raise exception 'Seul le parent qui a payé cette dépense peut la supprimer';
  end if;

  update expenses set deleted_at = now() where id = p_expense;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before)
  values (e.household_id, auth.uid(), 'delete', 'expense', p_expense,
          jsonb_build_object('title', e.title, 'amount_cents', e.amount_cents,
                             'spent_on', e.spent_on, 'status', e.status));
end $$;

grant execute on function public.update_expense(uuid, text, bigint, date, uuid, uuid[], jsonb) to authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;
