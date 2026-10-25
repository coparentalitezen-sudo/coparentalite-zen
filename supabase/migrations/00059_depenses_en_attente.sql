-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00059 : dépenses en attente de vérification
--
-- Le solde (household_balance) ne compte que les dépenses validées par
-- l'autre parent. C'est voulu et ne change pas. Mais un parent qui utilise
-- l'application seul — l'autre n'est qu'un profil provisoire, sans compte —
-- ne verra jamais une dépense validée : son solde affiche 0 € quel que soit
-- ce qu'il a avancé, ce qui revient à lui dire que tout est réglé.
--
-- Cette fonction calcule à part ce que représentent les dépenses encore en
-- attente de vérification, avec la même convention de signe que le solde.
-- L'écran l'affiche sous un libellé distinct : jamais additionné au solde,
-- jamais présenté comme accepté par l'autre parent.
--
-- Rejouable : create or replace, droits reposés à chaque passage.
-- ============================================================

begin;

create or replace function public.depenses_en_attente(p_household uuid)
returns table (
  net_cents  bigint,   -- positif : parent_1 recevrait ce montant une fois les dépenses validées
  parent_1   uuid,
  parent_2   uuid,
  nombre     int,
  total_cents bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  p1 uuid; p2 uuid; nb int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  select count(*) into nb from public.comptable_members(p_household);
  select cm.profile_id into p1 from public.comptable_members(p_household) cm where cm.rang = 1;
  select cm.profile_id into p2 from public.comptable_members(p_household) cm where cm.rang = 2;

  if nb <> 2 then
    return query select 0::bigint, p1, p2, 0, 0::bigint;
    return;
  end if;

  -- Statuts « en attente » : envoyée, vue, à valider. Une dépense contestée
  -- n'est plus en attente : elle est en discussion, et n'a pas à peser ici.
  return query
  with en_attente as (
    select e.id, e.amount_cents, e.paid_by
    from expenses e
    where e.household_id = p_household and e.deleted_at is null
      and e.status in ('sent', 'seen', 'to_validate')
  )
  select
    coalesce((
      select sum(case when a.paid_by = p1 and s.parent_id = p2 then  s.owed_cents
                      when a.paid_by = p2 and s.parent_id = p1 then -s.owed_cents
                      else 0 end)
      from en_attente a join expense_shares s on s.expense_id = a.id
    ), 0)::bigint,
    p1, p2,
    (select count(*) from en_attente)::int,
    coalesce((select sum(a.amount_cents) from en_attente a), 0)::bigint;
end $$;

revoke all on function public.depenses_en_attente(uuid) from public, anon;
grant execute on function public.depenses_en_attente(uuid) to authenticated;

commit;
