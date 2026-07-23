-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00010 : annulation d'un remboursement
--
-- Un remboursement saisi dans le mauvais sens ou pour un mauvais montant
-- doit pouvoir être annulé. Suppression LOGIQUE uniquement (deleted_at) :
-- la ligne reste en base et la trace est conservée dans audit_logs — on
-- ne réécrit jamais l'historique financier d'un foyer.
--
-- Autorisation : l'auteur de l'écriture, ou l'un des deux parents concernés.
-- Idempotent : create or replace.
-- ============================================================

create or replace function public.cancel_reimbursement(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare r reimbursements%rowtype;
begin
  select * into r from reimbursements where id = p_id for update;
  if not found or r.deleted_at is not null then
    raise exception 'Remboursement introuvable ou déjà annulé';
  end if;
  if not public.can_write(r.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  if auth.uid() <> r.created_by
     and auth.uid() <> r.from_parent
     and auth.uid() <> r.to_parent then
    raise exception 'Seuls les parents concernés peuvent annuler ce remboursement';
  end if;

  update reimbursements set deleted_at = now() where id = p_id;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before)
  values (r.household_id, auth.uid(), 'cancel', 'reimbursement', p_id,
          jsonb_build_object('amount_cents', r.amount_cents,
                             'from_parent', r.from_parent,
                             'to_parent', r.to_parent,
                             'paid_on', r.paid_on));
end $$;

grant execute on function public.cancel_reimbursement(uuid) to authenticated;
