-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00009 : remboursements
--
-- Permet au parent débiteur d'enregistrer le règlement de sa part,
-- avec justificatif facultatif. Le solde est recalculé côté application
-- en soustrayant les remboursements des parts dues.
--
-- Règles :
--   * seul un parent CONCERNÉ (émetteur ou destinataire) peut enregistrer
--     le remboursement — pas un tiers, même écrivain du foyer ;
--   * montant strictement positif, en centimes entiers ;
--   * les deux parents doivent être membres actifs du foyer ;
--   * émetteur ≠ destinataire ;
--   * trace horodatée dans audit_logs.
-- Idempotent : create or replace.
-- ============================================================

create or replace function public.create_reimbursement(
  p_household    uuid,
  p_from_parent  uuid,
  p_to_parent    uuid,
  p_amount_cents bigint,
  p_method       reimbursement_method,
  p_paid_on      date,
  p_reference    text default null,
  p_comment      text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à enregistrer un remboursement dans ce foyer';
  end if;
  if auth.uid() <> p_from_parent and auth.uid() <> p_to_parent then
    raise exception 'Vous ne pouvez enregistrer qu''un remboursement qui vous concerne';
  end if;
  if p_from_parent = p_to_parent then
    raise exception 'Les deux parents doivent être différents';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Le montant doit être strictement positif';
  end if;
  if not exists (select 1 from household_members
                 where household_id = p_household and profile_id = p_from_parent and deleted_at is null)
     or not exists (select 1 from household_members
                 where household_id = p_household and profile_id = p_to_parent and deleted_at is null) then
    raise exception 'Les deux parents doivent être membres du foyer';
  end if;

  insert into reimbursements (household_id, from_parent, to_parent, amount_cents,
                              method, paid_on, reference, comment, created_by)
  values (p_household, p_from_parent, p_to_parent, p_amount_cents,
          coalesce(p_method, 'bank_transfer'), coalesce(p_paid_on, current_date),
          nullif(trim(p_reference), ''), nullif(trim(p_comment), ''), auth.uid())
  returning id into rid;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (p_household, auth.uid(), 'create', 'reimbursement', rid);

  return rid;
end $$;

grant execute on function public.create_reimbursement(uuid, uuid, uuid, bigint, reimbursement_method, date, text, text) to authenticated;
