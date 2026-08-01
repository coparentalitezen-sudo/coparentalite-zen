-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00029 : notifications par observation
--
-- POURQUOI DES DÉCLENCHEURS
-- Quatre types de notification restaient inertes : modification d'une période,
-- dépenses, remboursements, invitations. Ils s'affichaient dans les réglages
-- sans que rien ne les émette — un réglage sans effet est pire qu'un réglage
-- absent.
--
-- Les brancher supposait de réécrire des fonctions éprouvées, dont celles qui
-- garantissent l'intégrité comptable. Une réécriture large a déjà fait
-- disparaître du code dans ce projet. Un déclencheur observe le changement
-- sans toucher à la logique : le risque de régression est quasi nul, et la
-- notification part quelle que soit la voie d'écriture employée.
--
-- L'AUTEUR N'EST JAMAIS NOTIFIÉ de sa propre action : notifier() l'écarte,
-- et auth.uid() reste disponible dans un déclencheur.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Modification d'une période de garde ----------
create or replace function public.trg_notifier_exception_modifiee()
returns trigger
language plpgsql security definer set search_path = public as $$
declare libelle text; prenom text; parent text;
begin
  -- Une suppression logique relève de l'autre déclencheur
  if new.deleted_at is not null and old.deleted_at is null then
    return new;
  end if;
  -- On ne prévient que d'un changement visible : dates ou parent gardien.
  -- Corriger une note n'a pas à déclencher une alerte.
  if new.starts_at = old.starts_at
     and new.ends_at = old.ends_at
     and new.parent_id = old.parent_id then
    return new;
  end if;

  select label into libelle from exception_types where code = new.kind;
  select first_name into prenom from children where id = new.child_id;
  select display_name into parent from profiles where id = new.parent_id;

  perform public.notifier(
    new.household_id, 'event_updated',
    format('%s modifiée', coalesce(libelle, 'Période')),
    format('%s : du %s au %s, chez %s.', prenom,
           to_char(new.starts_at, 'DD/MM'), to_char(new.ends_at, 'DD/MM'), parent),
    '/app/planning', 'custody_exception', new.id,
    coalesce(auth.uid(), new.created_by));
  return new;
end $$;

drop trigger if exists notifier_exception_modifiee on custody_exceptions;
create trigger notifier_exception_modifiee
  after update on custody_exceptions
  for each row execute function public.trg_notifier_exception_modifiee();

-- ---------- 2. Nouvelle dépense ----------
create or replace function public.trg_notifier_depense_creee()
returns trigger
language plpgsql security definer set search_path = public as $$
declare payeur text;
begin
  select display_name into payeur from profiles where id = new.paid_by;
  perform public.notifier(
    new.household_id, 'expense_created',
    new.title,
    format('%s payé par %s. À relire.',
           public.format_cents(new.amount_cents), coalesce(payeur, 'l''autre parent')),
    '/app/depenses', 'expense', new.id, auth.uid());
  return new;
end $$;

/**
 * Montant en centimes vers un libellé français : 4250 → « 42,50 € ».
 * Le séparateur décimal dépend des réglages du serveur : on le force, sans
 * quoi un montant s'afficherait « 42.50 € » dans une interface française.
 */
create or replace function public.format_cents(p_cents bigint)
returns text
language sql immutable as $$
  select replace(to_char(p_cents / 100.0, 'FM999999990.00'), '.', ',') || ' €'
$$;

drop trigger if exists notifier_depense_creee on expenses;
create trigger notifier_depense_creee
  after insert on expenses
  for each row execute function public.trg_notifier_depense_creee();

-- ---------- 3. Dépense relue ----------
create or replace function public.trg_notifier_depense_relue()
returns trigger
language plpgsql security definer set search_path = public as $$
declare titre text; corps text;
begin
  if new.status = old.status then return new; end if;

  if new.status = 'validated' then
    titre := format('%s validée', new.title);
    corps := format('%s : l''autre parent a validé cette dépense.',
                    public.format_cents(new.amount_cents));
  elsif new.status = 'disputed' then
    titre := format('%s à vérifier', new.title);
    -- Le motif permet de corriger sans ouvrir l'application. Il vit dans
    -- expense_comments, écrit par review_expense juste avant ce déclencheur.
    corps := format('%s : %s',
                    public.format_cents(new.amount_cents),
                    coalesce(
                      (select nullif(trim(ec.body), '')
                         from expense_comments ec
                        where ec.expense_id = new.id and ec.kind = 'dispute'
                        order by ec.created_at desc limit 1),
                      'l''autre parent demande une vérification.'));
  else
    return new;
  end if;

  perform public.notifier(
    new.household_id, 'expense_reviewed', titre, corps,
    -- Celui qui relit n'est pas celui qui a créé : l'auteur de la relecture
    -- est la session en cours, avec le payeur comme repli.
    '/app/depenses', 'expense', new.id, coalesce(auth.uid(), new.paid_by));
  return new;
end $$;

drop trigger if exists notifier_depense_relue on expenses;
create trigger notifier_depense_relue
  after update on expenses
  for each row execute function public.trg_notifier_depense_relue();

-- ---------- 4. Remboursement enregistré ----------
create or replace function public.trg_notifier_remboursement()
returns trigger
language plpgsql security definer set search_path = public as $$
declare de text;
begin
  select display_name into de from profiles where id = new.from_parent;
  perform public.notifier(
    new.household_id, 'reimbursement_created',
    'Remboursement enregistré',
    format('%s de la part de %s.',
           public.format_cents(new.amount_cents), coalesce(de, 'l''autre parent')),
    -- Seul le payeur peut enregistrer un remboursement : c'est lui l'auteur.
    '/app/depenses', 'reimbursement', new.id, new.from_parent);
  return new;
end $$;

drop trigger if exists notifier_remboursement on reimbursements;
create trigger notifier_remboursement
  after insert on reimbursements
  for each row execute function public.trg_notifier_remboursement();

-- ---------- 5. Invitation ----------
-- Le second parent n'a pas encore de compte : c'est donc le PREMIER parent
-- qui est notifié, comme trace de son propre envoi. À l'acceptation en
-- revanche, c'est lui qu'on prévient que le foyer est désormais partagé.
create or replace function public.trg_notifier_invitation()
returns trigger
language plpgsql security definer set search_path = public as $$
declare qui text;
begin
  if tg_op = 'INSERT' then
    perform public.notifier(
      new.household_id, 'invitation_sent',
      'Invitation créée',
      format('Un lien d''invitation a été créé pour %s.', new.email),
      '/app/foyer', 'invitation', new.id, null, null,
      -- Destinataire explicite : l'auteur lui-même, comme trace
      new.created_by);
    return new;
  end if;

  if new.status = 'accepted'::invitation_status
     and (old.status is null or old.status <> 'accepted'::invitation_status) then
    select display_name into qui from profiles where id = new.accepted_by;
    perform public.notifier(
      new.household_id, 'invitation_accepted',
      'Le second parent a rejoint le foyer',
      format('%s partage désormais votre planning et vos dépenses.',
             coalesce(qui, 'L''autre parent')),
      '/app/foyer', 'invitation', new.id, new.accepted_by);
  end if;
  return new;
end $$;

drop trigger if exists notifier_invitation_creee on invitations;
create trigger notifier_invitation_creee
  after insert on invitations
  for each row execute function public.trg_notifier_invitation();

drop trigger if exists notifier_invitation_acceptee on invitations;
create trigger notifier_invitation_acceptee
  after update on invitations
  for each row execute function public.trg_notifier_invitation();

-- ---------- 6. Droits ----------
-- Les fonctions de déclenchement s'exécutent avec les droits de leur
-- propriétaire : elles n'ont pas à être exposées au rôle applicatif.
revoke all on function public.trg_notifier_exception_modifiee() from public, anon, authenticated;
revoke all on function public.trg_notifier_depense_creee() from public, anon, authenticated;
revoke all on function public.trg_notifier_depense_relue() from public, anon, authenticated;
revoke all on function public.trg_notifier_remboursement() from public, anon, authenticated;
revoke all on function public.trg_notifier_invitation() from public, anon, authenticated;

commit;
