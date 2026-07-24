-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00013 : intégrité comptable
-- Révision 2 — intègre les corrections du second audit indépendant.
--
-- Principe : la RLS protège le FOYER ; elle ne protège pas les RÈGLES
-- COMPTABLES. Cette migration retire au rôle applicatif tout droit
-- d'écriture sur les tables comptables et fait des fonctions serveur
-- l'unique voie d'écriture, avec verrou transactionnel par foyer.
--
-- Idempotente : uniquement create or replace, revoke, grant, drop policy
-- if exists — rejouable sans effet de bord.
-- Transactionnelle : aucune instruction non transactionnelle (pas de
-- CREATE INDEX CONCURRENTLY ni de VACUUM), l'encapsulation BEGIN/COMMIT
-- est donc sûre et garantit un tout-ou-rien.
-- ============================================================

begin;

-- ============================================================
-- PARTIE 1 — Utilitaires internes (jamais exposés au client)
-- ============================================================

-- Verrou transactionnel du foyer : sérialise les opérations comptables
-- concurrentes. Le verrou est posé sur la ligne du foyer et libéré à la fin
-- de la transaction, donc à la fin de l'appel RPC.
create or replace function public.lock_household(p_household uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from households where id = p_household and deleted_at is null for update;
end $$;

-- Les deux membres COMPTABLES du foyer : propriétaire et parent uniquement.
-- Médiateur, observateur, beau-parent et administrateur sont exclus.
-- Ordre déterministe : ancienneté d'entrée, puis identifiant.
create or replace function public.comptable_members(p_household uuid)
returns table (rang int, profile_id uuid)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by hm.joined_at, hm.profile_id))::int, hm.profile_id
  from household_members hm
  where hm.household_id = p_household
    and hm.deleted_at is null
    and hm.role in ('owner', 'parent')
$$;

-- Contrôle d'appartenance comptable, utilisé par les validations de parties.
create or replace function public.est_comptable(p_household uuid, p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.comptable_members(p_household) cm
                 where cm.profile_id = p_profile)
$$;

-- Une dépense est VERROUILLÉE si elle compte dans le solde (validée,
-- partiellement remboursée ou remboursée) alors qu'un remboursement actif
-- existe dans le foyer : la modifier déplacerait un solde déjà réglé.
create or replace function public.expense_verrouillee(p_expense uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from expenses e
    where e.id = p_expense
      and e.deleted_at is null
      and e.status in ('validated', 'partially_reimbursed', 'reimbursed')
      and exists (select 1 from reimbursements r
                  where r.household_id = e.household_id and r.deleted_at is null)
  )
$$;

-- Validation commune des parties d'une dépense (payeur + parts).
-- Refuse : rôle non comptable, membre étranger, doublon de parent,
-- somme des parts différente du montant.
create or replace function public.valider_parties(
  p_household uuid, p_paid_by uuid, p_amount_cents bigint, p_shares jsonb)
returns void
language plpgsql stable security definer set search_path = public as $$
declare total bigint := 0; part jsonb; n_parts int; n_distinct int;
begin
  if not public.est_comptable(p_household, p_paid_by) then
    raise exception 'Le payeur doit être l''un des deux parents du foyer';
  end if;
  if p_shares is null or jsonb_array_length(p_shares) = 0 then
    raise exception 'La répartition entre parents est requise';
  end if;

  select count(*), count(distinct (s->>'parent_id'))
    into n_parts, n_distinct
  from jsonb_array_elements(p_shares) s;
  if n_parts <> n_distinct then
    raise exception 'Un même parent apparaît deux fois dans la répartition';
  end if;
  if n_parts > 2 then
    raise exception 'La répartition ne peut concerner que les deux parents du foyer';
  end if;

  for part in select * from jsonb_array_elements(p_shares) loop
    if (part->>'owed_cents') is null or (part->>'owed_cents')::bigint < 0 then
      raise exception 'Une part négative ou absente est interdite';
    end if;
    if not public.est_comptable(p_household, (part->>'parent_id')::uuid) then
      raise exception 'Une des parts vise une personne qui n''est pas un parent comptable du foyer';
    end if;
    total := total + (part->>'owed_cents')::bigint;
  end loop;

  if total <> p_amount_cents then
    raise exception 'La somme des parts (%) ne correspond pas au montant total (%)', total, p_amount_cents;
  end if;
end $$;

-- ============================================================
-- PARTIE 2 — Écritures : fonctions serveur autoritaires
-- ============================================================

create or replace function public.create_expense_full(
  p_household    uuid,
  p_title        text,
  p_amount_cents bigint,
  p_spent_on     date,
  p_category_id  uuid,
  p_paid_by      uuid,
  p_child_ids    uuid[],
  p_shares       jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare eid uuid; n_children int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à ajouter une dépense dans ce foyer';
  end if;
  perform public.lock_household(p_household);

  if coalesce(trim(p_title), '') = '' then
    raise exception 'Le titre de la dépense est requis';
  end if;
  if length(trim(p_title)) > 120 then
    raise exception 'Le titre ne peut pas dépasser 120 caractères';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Le montant doit être strictement positif';
  end if;
  if p_amount_cents > 100000000 then
    raise exception 'Le montant dépasse le plafond autorisé (1 000 000 €)';
  end if;
  if p_spent_on is null then
    raise exception 'La date de la dépense est requise';
  end if;
  if p_spent_on > current_date + 1 then
    raise exception 'La date de la dépense ne peut pas être dans le futur';
  end if;

  perform public.valider_parties(p_household, p_paid_by, p_amount_cents, p_shares);

  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    select count(*) into n_children from children
    where id = any(p_child_ids) and household_id = p_household and deleted_at is null;
    if n_children <> array_length(p_child_ids, 1) then
      raise exception 'Un des enfants sélectionnés n''appartient pas à ce foyer';
    end if;
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

-- review_expense : réservé à l'AUTRE parent comptable du foyer.
create or replace function public.review_expense(
  p_expense uuid,
  p_action  text,
  p_comment text default null,
  p_accepted_cents bigint default null
) returns void
language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype; nb_comptables int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if p_action is null or p_action not in ('validate', 'dispute', 'clarify') then
    raise exception 'Action non reconnue : seules la validation, la contestation et la demande de précision sont possibles';
  end if;

  select * into e from expenses where id = p_expense and deleted_at is null for update;
  if not found then raise exception 'Dépense introuvable ou supprimée'; end if;
  perform public.lock_household(e.household_id);
  if not public.can_write(e.household_id) then raise exception 'Action non autorisée'; end if;

  -- l'auteur de la revue doit être un parent comptable, et l'autre que le payeur
  if not public.est_comptable(e.household_id, auth.uid()) then
    raise exception 'Seul un parent du foyer peut valider ou contester une dépense';
  end if;
  select count(*) into nb_comptables from public.comptable_members(e.household_id);
  if nb_comptables <> 2 then
    raise exception 'La validation exige que les deux parents soient présents dans le foyer';
  end if;
  if e.paid_by = auth.uid() then
    raise exception 'La dépense doit être validée par l''autre parent';
  end if;
  if e.created_by = auth.uid() then
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
declare e expenses%rowtype; n_children int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;

  select * into e from expenses where id = p_expense and deleted_at is null for update;
  if not found then raise exception 'Dépense introuvable'; end if;
  perform public.lock_household(e.household_id);
  if not public.can_write(e.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier cette dépense';
  end if;
  if auth.uid() <> e.paid_by and auth.uid() <> e.created_by then
    raise exception 'Seul le parent qui a payé cette dépense peut la modifier';
  end if;

  -- VERROU COMPTABLE, dans la même transaction que la modification
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

  perform public.valider_parties(e.household_id, e.paid_by, p_amount_cents, p_shares);

  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    select count(*) into n_children from children
    where id = any(p_child_ids) and household_id = e.household_id and deleted_at is null;
    if n_children <> array_length(p_child_ids, 1) then
      raise exception 'Un des enfants sélectionnés n''appartient pas à ce foyer';
    end if;
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

create or replace function public.delete_expense(p_expense uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare e expenses%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into e from expenses where id = p_expense and deleted_at is null for update;
  if not found then raise exception 'Dépense introuvable ou déjà supprimée'; end if;
  perform public.lock_household(e.household_id);
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

-- create_reimbursement : seul le PAYEUR enregistre son propre versement,
-- dans le bon sens et dans la limite de ce qu'il doit réellement.
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
declare rid uuid; b record; du bigint;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à enregistrer un remboursement dans ce foyer';
  end if;

  -- Verrou AVANT lecture du solde : le contrôle du montant dû et l'insertion
  -- forment une opération atomique, à l'abri d'un remboursement concurrent.
  perform public.lock_household(p_household);

  if auth.uid() <> p_from_parent then
    raise exception 'Seul le parent qui effectue le paiement peut enregistrer ce remboursement';
  end if;
  if p_from_parent = p_to_parent then
    raise exception 'Les deux parents doivent être différents';
  end if;
  if not public.est_comptable(p_household, p_from_parent)
     or not public.est_comptable(p_household, p_to_parent) then
    raise exception 'Les deux parties doivent être les parents comptables du foyer';
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

  -- Sens et plafond : on ne rembourse que ce que l'on doit
  select * into b from public.household_balance(p_household);
  du := case
          when p_from_parent = b.parent_2 and b.net_cents > 0 then  b.net_cents
          when p_from_parent = b.parent_1 and b.net_cents < 0 then -b.net_cents
          else 0
        end;
  if du = 0 then
    raise exception 'Aucun montant n''est dû dans ce sens : soit les comptes sont équilibrés, soit c''est à l''autre parent de rembourser';
  end if;
  if p_amount_cents > du then
    raise exception 'Le montant dépasse ce qui reste dû (% €)', to_char(du / 100.0, 'FM999999990D00');
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
                             'to_parent', p_to_parent, 'du_avant', du));
  return rid;
end $$;

-- cancel_reimbursement : identité, appartenance, verrou, non rejouable, tracé.
create or replace function public.cancel_reimbursement(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare r reimbursements%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;

  select * into r from reimbursements where id = p_id for update;
  if not found then raise exception 'Remboursement introuvable'; end if;
  perform public.lock_household(r.household_id);

  if not public.is_member(r.household_id) then
    raise exception 'Remboursement introuvable';   -- ne révèle rien à un tiers
  end if;
  if not public.can_write(r.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  if r.deleted_at is not null then
    raise exception 'Ce remboursement a déjà été annulé';
  end if;
  if auth.uid() <> r.created_by
     and auth.uid() <> r.from_parent
     and auth.uid() <> r.to_parent then
    raise exception 'Seuls les parents concernés peuvent annuler ce remboursement';
  end if;

  update reimbursements set deleted_at = now() where id = p_id and deleted_at is null;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before)
  values (r.household_id, auth.uid(), 'cancel', 'reimbursement', p_id,
          jsonb_build_object('amount_cents', r.amount_cents,
                             'from_parent', r.from_parent,
                             'to_parent', r.to_parent,
                             'paid_on', r.paid_on));
end $$;

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
-- PARTIE 3 — Solde autoritaire (lecture)
-- ============================================================
create or replace function public.household_balance(p_household uuid)
returns table (
  net_cents                     bigint,   -- positif : parent_1 doit recevoir
  parent_1                      uuid,
  parent_2                      uuid,
  debiteur                      uuid,
  crediteur                     uuid,
  equilibre                     boolean,
  membres_comptables            int,
  depenses_prises_en_compte     int,
  depenses_total_cents          bigint,
  remboursements_pris_en_compte int,
  remboursements_total_cents    bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  p1 uuid; p2 uuid; nb int;
  net_depenses bigint := 0; net_remb bigint := 0;
  du_p1 bigint := 0; du_p2 bigint := 0;   -- contre-calcul indépendant
  nb_dep int := 0; total_dep bigint := 0;
  nb_remb int := 0; total_remb bigint := 0;
  net bigint;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  -- le household_id transmis par le client n'est jamais pris pour argent comptant
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  select count(*) into nb from public.comptable_members(p_household);
  if nb > 2 then
    raise exception 'Foyer incohérent : % membres comptables au lieu de 2', nb;
  end if;

  select cm.profile_id into p1 from public.comptable_members(p_household) cm where cm.rang = 1;
  select cm.profile_id into p2 from public.comptable_members(p_household) cm where cm.rang = 2;

  -- Foyer incomplet : aucun solde entre parents, état neutre et explicite
  if nb < 2 then
    return query select 0::bigint, p1, p2, null::uuid, null::uuid, true, nb,
                        0, 0::bigint, 0, 0::bigint;
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
  where e.household_id = p_household and e.deleted_at is null
    and e.status in ('validated', 'partially_reimbursed', 'reimbursed');

  -- Contre-calcul indépendant, par parent, pour vérifier la cohérence
  select coalesce(sum(case when e.paid_by = p1 and s.parent_id = p2 then s.owed_cents else 0 end), 0),
         coalesce(sum(case when e.paid_by = p2 and s.parent_id = p1 then s.owed_cents else 0 end), 0)
    into du_p2, du_p1
  from expenses e
  join expense_shares s on s.expense_id = e.id
  where e.household_id = p_household and e.deleted_at is null
    and e.status in ('validated', 'partially_reimbursed', 'reimbursed');

  if net_depenses <> du_p2 - du_p1 then
    raise exception 'Incohérence comptable détectée sur les dépenses (% vs %)',
      net_depenses, du_p2 - du_p1;
  end if;

  select count(*)::int, coalesce(sum(e.amount_cents), 0)
    into nb_dep, total_dep
  from expenses e
  where e.household_id = p_household and e.deleted_at is null
    and e.status in ('validated', 'partially_reimbursed', 'reimbursed');

  -- Remboursements actifs uniquement (les annulés portent un deleted_at)
  select coalesce(sum(case when r.from_parent = p2 and r.to_parent = p1 then -r.amount_cents
                           when r.from_parent = p1 and r.to_parent = p2 then  r.amount_cents
                           else 0 end), 0),
         count(*)::int,
         coalesce(sum(r.amount_cents), 0)
    into net_remb, nb_remb, total_remb
  from reimbursements r
  where r.household_id = p_household and r.deleted_at is null;

  net := net_depenses + net_remb;

  -- Invariants : le net ne peut pas excéder ce qui a transité
  if abs(net) > total_dep + total_remb then
    raise exception 'Incohérence comptable : net (%) supérieur aux flux (% + %)',
      net, total_dep, total_remb;
  end if;
  if abs(net_remb) > total_remb then
    raise exception 'Incohérence comptable sur les remboursements';
  end if;

  return query select
    net, p1, p2,
    case when net > 0 then p2 when net < 0 then p1 else null end,
    case when net > 0 then p1 when net < 0 then p2 else null end,
    (net = 0), nb, nb_dep, total_dep, nb_remb, total_remb;
end $$;

-- ============================================================
-- PARTIE 4 — Droits : tables comptables en lecture seule,
--            utilitaires internes non exposés
-- ============================================================

-- 4.1 Tables comptables : plus aucune écriture directe, pour AUCUN rôle client.
revoke insert, update, delete, truncate on public.expenses          from public, anon, authenticated;
revoke insert, update, delete, truncate on public.expense_shares    from public, anon, authenticated;
revoke insert, update, delete, truncate on public.expense_children  from public, anon, authenticated;
revoke insert, update, delete, truncate on public.expense_comments  from public, anon, authenticated;
revoke insert, update, delete, truncate on public.reimbursements    from public, anon, authenticated;

-- Seule la lecture reste ouverte ; la RLS continue de filtrer par foyer.
grant select on public.expenses, public.expense_shares, public.expense_children,
                public.expense_comments, public.reimbursements to authenticated;

-- Les policies d'écriture correspondantes n'ont plus d'objet.
drop policy if exists expenses_ins on expenses;
drop policy if exists expenses_upd on expenses;
drop policy if exists exs_ins on expense_shares;
drop policy if exists exs_upd on expense_shares;
drop policy if exists exc_ins on expense_children;
drop policy if exists exc_del on expense_children;
drop policy if exists reimbursements_ins on reimbursements;
drop policy if exists reimbursements_upd on reimbursements;
drop policy if exists exco_ins on expense_comments;

-- 4.2 Utilitaires internes : retirés de PUBLIC (droit accordé par défaut),
--     d'anon et d'authenticated. Ils restent appelables par les fonctions
--     SECURITY DEFINER, qui s'exécutent avec les droits du propriétaire.
revoke all on function public.lock_household(uuid)                     from public, anon, authenticated;
revoke all on function public.comptable_members(uuid)                  from public, anon, authenticated;
revoke all on function public.est_comptable(uuid, uuid)                from public, anon, authenticated;
revoke all on function public.expense_verrouillee(uuid)                from public, anon, authenticated;
revoke all on function public.valider_parties(uuid, uuid, bigint, jsonb) from public, anon, authenticated;

-- 4.3 Fonctions applicatives : PUBLIC retiré, droit accordé au seul rôle connecté.
revoke all on function public.create_expense_full(uuid, text, bigint, date, uuid, uuid, uuid[], jsonb) from public, anon;
revoke all on function public.review_expense(uuid, text, text, bigint) from public, anon;
revoke all on function public.update_expense(uuid, text, bigint, date, uuid, uuid[], jsonb) from public, anon;
revoke all on function public.delete_expense(uuid) from public, anon;
revoke all on function public.create_reimbursement(uuid, uuid, uuid, bigint, reimbursement_method, date, text, text) from public, anon;
revoke all on function public.cancel_reimbursement(uuid) from public, anon;
revoke all on function public.set_reimbursement_attachment(uuid, text) from public, anon;
revoke all on function public.household_balance(uuid) from public, anon;

grant execute on function public.create_expense_full(uuid, text, bigint, date, uuid, uuid, uuid[], jsonb) to authenticated;
grant execute on function public.review_expense(uuid, text, text, bigint) to authenticated;
grant execute on function public.update_expense(uuid, text, bigint, date, uuid, uuid[], jsonb) to authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;
grant execute on function public.create_reimbursement(uuid, uuid, uuid, bigint, reimbursement_method, date, text, text) to authenticated;
grant execute on function public.cancel_reimbursement(uuid) to authenticated;
grant execute on function public.set_reimbursement_attachment(uuid, text) to authenticated;
grant execute on function public.household_balance(uuid) to authenticated;

commit;
