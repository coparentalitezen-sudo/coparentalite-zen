-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00013 : intégrité comptable
--
-- Constat de l'audit : la RLS protège le FOYER, pas les RÈGLES COMPTABLES.
-- Un membre légitime pouvait, par écriture directe sur les tables :
--   * valider sa propre dépense (update expenses.status) ;
--   * désaccorder la somme des parts du montant (update expense_shares) ;
--   * forger un remboursement au nom de l'autre parent (insert reimbursements).
-- Ces écritures ne laissaient aucune trace dans audit_logs.
--
-- Cette migration :
--   1. retire au rôle applicatif tout droit d'écriture sur les tables
--      comptables — les lectures du foyer restent inchangées ;
--   2. durcit les fonctions serveur (seules voies d'écriture légitimes) ;
--   3. verrouille les dépenses entrées dans un solde déjà remboursé ;
--   4. crée household_balance(), source unique et complète du solde.
--
-- Idempotente : rejouable sans risque.
-- ORDRE D'APPLICATION IMPÉRATIF : ce fichier crée les fonctions AVANT de
-- retirer les droits, dans la même transaction implicite du script.
-- ============================================================

-- ============================================================
-- PARTIE 1 — Fonctions serveur durcies
-- ============================================================

-- ---------- Utilitaire interne : les deux membres comptables du foyer ----------
-- Déterministe : rôles comptables uniquement (propriétaire et parent),
-- triés par ancienneté puis identifiant. Médiateur, observateur, beau-parent
-- et administrateur sont exclus du calcul du solde.
create or replace function public.comptable_members(p_household uuid)
returns table (rang int, profile_id uuid)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by hm.joined_at, hm.profile_id))::int, hm.profile_id
  from household_members hm
  where hm.household_id = p_household
    and hm.deleted_at is null
    and hm.role in ('owner', 'parent')
$$;

-- ---------- Verrou comptable : la dépense est-elle figée ? ----------
-- Une dépense est figée lorsqu'elle COMPTE dans le solde (validée,
-- partiellement remboursée ou remboursée) ET qu'un remboursement actif est
-- intervenu APRÈS son entrée au registre. La modifier reviendrait alors à
-- déplacer un solde que l'autre parent a déjà réglé.
--
-- La comparaison des dates de création est essentielle : sans elle, le
-- premier remboursement d'un foyer figerait aussi toutes les dépenses
-- futures, rendant la correction d'une simple faute de frappe impossible.
-- Une dépense saisie APRÈS le dernier règlement reste donc modifiable,
-- jusqu'au règlement suivant.
create or replace function public.expense_verrouillee(p_expense uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from expenses e
    where e.id = p_expense
      and e.deleted_at is null
      and e.status in ('validated', 'partially_reimbursed', 'reimbursed')
      and exists (
        select 1 from reimbursements r
        where r.household_id = e.household_id
          and r.deleted_at is null
          and r.created_at >= e.created_at
      )
  )
$$;

-- ---------- create_expense_full : inchangée sur le fond, messages garantis ----------
create or replace function public.create_expense_full(
  p_household   uuid,
  p_title       text,
  p_amount_cents bigint,
  p_spent_on    date,
  p_category_id uuid,
  p_paid_by     uuid,
  p_child_ids   uuid[],
  p_shares      jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
  total bigint := 0;
  part jsonb;
  n_children int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à ajouter une dépense dans ce foyer';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Le titre de la dépense est requis';
  end if;
  if length(trim(p_title)) > 120 then
    raise exception 'Le titre ne peut pas dépasser 120 caractères';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Le montant doit être strictement positif';
  end if;
  if p_amount_cents > 100000000 then         -- 1 000 000,00 €
    raise exception 'Le montant dépasse le plafond autorisé (1 000 000 €)';
  end if;
  if p_spent_on is null then
    raise exception 'La date de la dépense est requise';
  end if;
  if p_spent_on > current_date + 1 then
    raise exception 'La date de la dépense ne peut pas être dans le futur';
  end if;
  if not exists (select 1 from household_members
                 where household_id = p_household and profile_id = p_paid_by and deleted_at is null) then
    raise exception 'Le parent payeur n''appartient pas à ce foyer';
  end if;

  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    select count(*) into n_children from children
    where id = any(p_child_ids) and household_id = p_household and deleted_at is null;
    if n_children <> array_length(p_child_ids, 1) then
      raise exception 'Un des enfants sélectionnés n''appartient pas à ce foyer';
    end if;
  end if;

  if p_shares is null or jsonb_array_length(p_shares) = 0 then
    raise exception 'La répartition entre parents est requise';
  end if;
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
    raise exception 'La somme des parts (%) ne correspond pas au montant total (%)', total, p_amount_cents;
  end if;

  insert into expenses (household_id, title, amount_cents, spent_on, category_id,
                        paid_by, status, created_by)
  values (p_household, trim(p_title), p_amount_cents, p_spent_on, p_category_id,
          p_paid_by, 'sent', auth.uid())
  returning id into eid;

  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    insert into expense_children (expense_id, child_id) select eid, unnest(p_child_ids);
  end if;

  insert into expense_shares (expense_id, parent_id, kind, basis_points, owed_cents)
  select eid, (s->>'parent_id')::uuid, 'percentage',
         nullif(s->>'basis_points','')::int, (s->>'owed_cents')::bigint
  from jsonb_array_elements(p_shares) s;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
  values (p_household, auth.uid(), 'create', 'expense', eid,
          jsonb_build_object('title', trim(p_title), 'amount_cents', p_amount_cents,
                             'spent_on', p_spent_on, 'status', 'sent'));
  return eid;
end $$;

-- ---------- review_expense : actions strictement énumérées, pas de double validation ----------
create or replace function public.review_expense(
  p_expense uuid,
  p_action  text,
  p_comment text default null,
  p_accepted_cents bigint default null
) returns void
language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if p_action is null or p_action not in ('validate', 'dispute', 'clarify') then
    raise exception 'Action non reconnue : seules la validation, la contestation et la demande de précision sont possibles';
  end if;

  select * into e from expenses where id = p_expense and deleted_at is null for update;
  if not found then raise exception 'Dépense introuvable ou supprimée'; end if;
  if not public.can_write(e.household_id) then raise exception 'Action non autorisée'; end if;
  if e.paid_by = auth.uid() then
    raise exception 'La dépense doit être validée par l''autre parent';
  end if;
  if e.created_by = auth.uid() and e.paid_by <> auth.uid() then
    raise exception 'Vous ne pouvez pas valider une dépense que vous avez saisie';
  end if;
  if p_action = 'validate' and e.status = 'validated' then
    raise exception 'Cette dépense a déjà été validée';
  end if;
  if e.status in ('partially_reimbursed', 'reimbursed') then
    raise exception 'Cette dépense a déjà été remboursée : son statut ne peut plus changer';
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

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before, after)
  values (e.household_id, auth.uid(), p_action, 'expense', p_expense,
          jsonb_build_object('status', e.status),
          jsonb_build_object('status', case p_action when 'validate' then 'validated'
                                                     when 'dispute' then 'disputed'
                                                     else 'to_validate' end));
end $$;

-- ---------- update_expense : verrou comptable ----------
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
  e expenses%rowtype;
  total bigint := 0;
  part jsonb;
  n_children int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;

  select * into e from expenses where id = p_expense and deleted_at is null for update;
  if not found then raise exception 'Dépense introuvable'; end if;
  if not public.can_write(e.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier cette dépense';
  end if;
  if auth.uid() <> e.paid_by and auth.uid() <> e.created_by then
    raise exception 'Seul le parent qui a payé cette dépense peut la modifier';
  end if;

  -- VERROU COMPTABLE (dans la même transaction que la modification)
  if public.expense_verrouillee(p_expense) then
    raise exception 'Cette dépense ne peut plus être modifiée car elle a déjà été remboursée. Annulez d''abord le remboursement.';
  end if;

  if coalesce(trim(p_title), '') = '' then raise exception 'Le titre de la dépense est requis'; end if;
  if length(trim(p_title)) > 120 then raise exception 'Le titre ne peut pas dépasser 120 caractères'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Le montant doit être strictement positif';
  end if;
  if p_amount_cents > 100000000 then
    raise exception 'Le montant dépasse le plafond autorisé (1 000 000 €)';
  end if;
  if p_spent_on is not null and p_spent_on > current_date + 1 then
    raise exception 'La date de la dépense ne peut pas être dans le futur';
  end if;

  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    select count(*) into n_children from children
    where id = any(p_child_ids) and household_id = e.household_id and deleted_at is null;
    if n_children <> array_length(p_child_ids, 1) then
      raise exception 'Un des enfants sélectionnés n''appartient pas à ce foyer';
    end if;
  end if;

  if p_shares is null or jsonb_array_length(p_shares) = 0 then
    raise exception 'La répartition entre parents est requise';
  end if;
  for part in select * from jsonb_array_elements(p_shares) loop
    if (part->>'owed_cents')::bigint < 0 then raise exception 'Une part négative est interdite'; end if;
    if not exists (select 1 from household_members
                   where household_id = e.household_id
                     and profile_id = (part->>'parent_id')::uuid and deleted_at is null) then
      raise exception 'Une des parts vise un parent extérieur au foyer';
    end if;
    total := total + (part->>'owed_cents')::bigint;
  end loop;
  if total <> p_amount_cents then
    raise exception 'La somme des parts (%) ne correspond pas au montant total (%)', total, p_amount_cents;
  end if;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before, after)
  values (e.household_id, auth.uid(), 'update', 'expense', p_expense,
          jsonb_build_object('title', e.title, 'amount_cents', e.amount_cents,
                             'spent_on', e.spent_on, 'status', e.status),
          jsonb_build_object('title', trim(p_title), 'amount_cents', p_amount_cents,
                             'spent_on', p_spent_on, 'status', 'sent'));

  update expenses
     set title = trim(p_title), amount_cents = p_amount_cents,
         spent_on = coalesce(p_spent_on, e.spent_on),
         category_id = p_category_id, status = 'sent'
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

-- ---------- delete_expense : verrou comptable ----------
create or replace function public.delete_expense(p_expense uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into e from expenses where id = p_expense and deleted_at is null for update;
  if not found then raise exception 'Dépense introuvable ou déjà supprimée'; end if;
  if not public.can_write(e.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  if auth.uid() <> e.paid_by and auth.uid() <> e.created_by then
    raise exception 'Seul le parent qui a payé cette dépense peut la supprimer';
  end if;
  if public.expense_verrouillee(p_expense) then
    raise exception 'Annulez d''abord le remboursement avant de supprimer cette dépense.';
  end if;

  update expenses set deleted_at = now() where id = p_expense;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before)
  values (e.household_id, auth.uid(), 'delete', 'expense', p_expense,
          jsonb_build_object('title', e.title, 'amount_cents', e.amount_cents,
                             'spent_on', e.spent_on, 'status', e.status));
end $$;

-- ---------- create_reimbursement : plafonds et date ----------
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
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
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
  if p_amount_cents > 100000000 then
    raise exception 'Le montant dépasse le plafond autorisé (1 000 000 €)';
  end if;
  if coalesce(p_paid_on, current_date) > current_date + 1 then
    raise exception 'La date du remboursement ne peut pas être dans le futur';
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

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
  values (p_household, auth.uid(), 'create', 'reimbursement', rid,
          jsonb_build_object('amount_cents', p_amount_cents, 'from_parent', p_from_parent,
                             'to_parent', p_to_parent));
  return rid;
end $$;

-- ---------- Justificatif de remboursement : passe désormais par le serveur ----------
create or replace function public.set_reimbursement_attachment(p_id uuid, p_path text)
returns void
language plpgsql security definer set search_path = public as $$
declare r reimbursements%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into r from reimbursements where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Remboursement introuvable'; end if;
  if not public.can_write(r.household_id) then raise exception 'Action non autorisée'; end if;
  if auth.uid() <> r.created_by and auth.uid() <> r.from_parent and auth.uid() <> r.to_parent then
    raise exception 'Seuls les parents concernés peuvent joindre un justificatif';
  end if;
  if p_path is null or public.household_from_path(p_path) <> r.household_id then
    raise exception 'Chemin de fichier invalide pour ce foyer';
  end if;
  update reimbursements set attachment_path = p_path where id = p_id;
end $$;

-- ============================================================
-- PARTIE 2 — Solde autoritaire, calculé en base sur TOUTES les données
-- ============================================================
create or replace function public.household_balance(p_household uuid)
returns table (
  net_cents                     bigint,   -- positif : parent_1 doit recevoir
  parent_1                      uuid,
  parent_2                      uuid,
  debiteur                      uuid,
  crediteur                     uuid,
  equilibre                     boolean,
  depenses_prises_en_compte     int,
  depenses_total_cents          bigint,
  remboursements_pris_en_compte int,
  remboursements_total_cents    bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  p1 uuid; p2 uuid;
  net_depenses bigint := 0;
  net_remb     bigint := 0;
  nb_dep int := 0; total_dep bigint := 0;
  nb_remb int := 0; total_remb bigint := 0;
  net bigint;
begin
  -- Le household_id transmis par le client n'est jamais pris pour argent comptant
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  select cm.profile_id into p1 from public.comptable_members(p_household) cm where cm.rang = 1;
  select cm.profile_id into p2 from public.comptable_members(p_household) cm where cm.rang = 2;

  -- Foyer à un seul parent comptable : aucun solde entre parents
  if p1 is null or p2 is null then
    return query select 0::bigint, p1, p2, null::uuid, null::uuid, true, 0, 0::bigint, 0, 0::bigint;
    return;
  end if;

  -- Dépenses comptables, sur l'INTÉGRALITÉ du foyer (aucune limite de lignes)
  select coalesce(sum(
           case when e.paid_by = p1 and s.parent_id = p2 then  s.owed_cents
                when e.paid_by = p2 and s.parent_id = p1 then -s.owed_cents
                else 0 end), 0)
    into net_depenses
  from expenses e
  join expense_shares s on s.expense_id = e.id
  where e.household_id = p_household
    and e.deleted_at is null
    and e.status in ('validated', 'partially_reimbursed', 'reimbursed');

  select count(*)::int, coalesce(sum(e.amount_cents), 0)
    into nb_dep, total_dep
  from expenses e
  where e.household_id = p_household
    and e.deleted_at is null
    and e.status in ('validated', 'partially_reimbursed', 'reimbursed');

  -- Remboursements actifs uniquement (les annulés sont exclus par deleted_at)
  select coalesce(sum(case when r.from_parent = p2 and r.to_parent = p1 then -r.amount_cents
                           when r.from_parent = p1 and r.to_parent = p2 then  r.amount_cents
                           else 0 end), 0),
         count(*)::int,
         coalesce(sum(r.amount_cents), 0)
    into net_remb, nb_remb, total_remb
  from reimbursements r
  where r.household_id = p_household and r.deleted_at is null;

  net := net_depenses + net_remb;

  return query select
    net, p1, p2,
    case when net > 0 then p2 when net < 0 then p1 else null end,
    case when net > 0 then p1 when net < 0 then p2 else null end,
    (net = 0), nb_dep, total_dep, nb_remb, total_remb;
end $$;

-- ============================================================
-- PARTIE 3 — Droits : les tables comptables deviennent en lecture seule
-- ============================================================
-- La lecture reste ouverte aux membres (RLS inchangée).
-- Toute écriture doit passer par les fonctions ci-dessus, qui sont
-- SECURITY DEFINER et s'exécutent avec les droits du propriétaire.
revoke insert, update, delete on public.expenses        from authenticated;
revoke insert, update, delete on public.expense_shares  from authenticated;
revoke insert, update, delete on public.expense_children from authenticated;
revoke insert, update, delete on public.reimbursements  from authenticated;
revoke insert, update, delete on public.expense_comments from authenticated;

-- Les policies d'écriture correspondantes n'ont plus d'objet : on les retire
-- pour que l'intention soit lisible dans le tableau de bord Supabase.
drop policy if exists expenses_ins on expenses;
drop policy if exists expenses_upd on expenses;
drop policy if exists exs_ins on expense_shares;
drop policy if exists exs_upd on expense_shares;
drop policy if exists exc_ins on expense_children;
drop policy if exists exc_del on expense_children;
drop policy if exists reimbursements_ins on reimbursements;
drop policy if exists reimbursements_upd on reimbursements;
drop policy if exists exco_ins on expense_comments;

-- Les futures tables du schéma ne doivent pas hériter de droits d'écriture
-- sur ces objets : on ne touche pas aux default privileges globaux, mais on
-- s'assure que les droits de lecture restent explicites.
grant select on public.expenses, public.expense_shares, public.expense_children,
                public.reimbursements, public.expense_comments to authenticated;

grant execute on function public.comptable_members(uuid) to authenticated;
grant execute on function public.expense_verrouillee(uuid) to authenticated;
grant execute on function public.household_balance(uuid) to authenticated;
grant execute on function public.set_reimbursement_attachment(uuid, text) to authenticated;
