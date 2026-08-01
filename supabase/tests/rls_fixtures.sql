-- Fixtures de test RLS (exécuté en superuser — simule le service_role)
-- Foyer A : Alice (owner), Bob (parent), Mia (médiatrice lecture seule)
-- Foyer B : Carol (owner)
-- Mallory : aucun foyer

insert into profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-00000000000a','alice@test.fr','Alice'),
  ('00000000-0000-0000-0000-00000000000b','bob@test.fr','Bob'),
  ('00000000-0000-0000-0000-00000000000c','carol@test.fr','Carol'),
  ('00000000-0000-0000-0000-00000000000d','mia@test.fr','Mia'),
  ('00000000-0000-0000-0000-00000000000e','mallory@test.fr','Mallory');

insert into households (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Foyer A','00000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Foyer B','00000000-0000-0000-0000-00000000000c');

insert into household_members (household_id, profile_id, role, color_key) values
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','owner','navy'),
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','parent','coral'),
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000d','mediator','sage'),
  ('bbbbbbbb-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c','owner','navy');

insert into children (id, household_id, first_name, allergies, created_by) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Léa','Arachides','00000000-0000-0000-0000-00000000000a'),
  ('cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Tom',null,'00000000-0000-0000-0000-00000000000c');

insert into expenses (id, household_id, title, amount_cents, spent_on, paid_by, status, created_by) values
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Cantine mars',8550,'2026-03-05','00000000-0000-0000-0000-00000000000a','validated','00000000-0000-0000-0000-00000000000a'),
  ('dddddddd-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Pharmacie',2340,'2026-03-08','00000000-0000-0000-0000-00000000000c','sent','00000000-0000-0000-0000-00000000000c');

insert into expense_attachments (id, expense_id, storage_path, file_name, mime_type, size_bytes, created_by) values
  ('eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','foyer-a/justif1.pdf','facture-cantine.pdf','application/pdf',52000,'00000000-0000-0000-0000-00000000000a');

insert into documents (household_id, title, storage_path, file_name, mime_type, size_bytes, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Convention parentale','foyer-a/convention.pdf','convention.pdf','application/pdf',120000,'00000000-0000-0000-0000-00000000000a');

-- Vérificateur hors-RLS du journal d'audit (le rôle parent n'y a pas accès, à dessein)
create or replace function public.test_audit_existe(p_entity text, p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from audit_logs where entity = p_entity and entity_id = p_id) $$;
grant execute on function public.test_audit_existe(text, uuid) to authenticated;

create or replace function public.test_remboursement_existe(p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from reimbursements where id = p_id) $$;
grant execute on function public.test_remboursement_existe(uuid) to authenticated;

create or replace function public.test_remboursement_actif(p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from reimbursements where id = p_id and deleted_at is null) $$;
grant execute on function public.test_remboursement_actif(uuid) to authenticated;

create or replace function public.test_depense_existe(p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from expenses where id = p_id) $$;

create or replace function public.test_audit_avant_apres(p_entity text, p_id uuid, p_avant bigint, p_apres bigint)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from audit_logs
    where entity = p_entity and entity_id = p_id and action = 'update'
      and (before->>'amount_cents')::bigint = p_avant
      and (after->>'amount_cents')::bigint = p_apres) $$;

grant execute on function public.test_depense_existe(uuid) to authenticated;
grant execute on function public.test_audit_avant_apres(text, uuid, bigint, bigint) to authenticated;

-- Force un statut de dépense sans passer par les fonctions métier.
-- Réservé aux tests : aucun parcours applicatif ne produit « partially_reimbursed »
-- aujourd'hui, il faut donc pouvoir le simuler pour vérifier son traitement comptable.
create or replace function public.test_forcer_statut(p_expense uuid, p_statut text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update expenses set status = p_statut::expense_status where id = p_expense;
end $$;
grant execute on function public.test_forcer_statut(uuid, text) to authenticated;

-- ---- Helpers de test (SECURITY DEFINER) : contourner volontairement les
-- ---- verrous pour construire des situations que l'application interdit.
create or replace function public.test_forcer_statut(p_expense uuid, p_statut text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update expenses set status = p_statut::expense_status where id = p_expense;
end $$;

create or replace function public.test_ajouter_membre(p_household uuid, p_profile uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into household_members (household_id, profile_id, role, color_key)
  values (p_household, p_profile, p_role::member_role, 'sage')
  on conflict (household_id, profile_id) do update set role = excluded.role, deleted_at = null;
end $$;

create or replace function public.test_retirer_membre(p_household uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update household_members set deleted_at = now()
  where household_id = p_household and profile_id = p_profile;
end $$;

grant execute on function public.test_forcer_statut(uuid, text) to authenticated;
grant execute on function public.test_ajouter_membre(uuid, uuid, text) to authenticated;
grant execute on function public.test_retirer_membre(uuid, uuid) to authenticated;

-- Lecture des membres comptables pour les tests (comptable_members est
-- volontairement inaccessible au rôle applicatif).
create or replace function public.test_comptables(p_household uuid)
returns table (rang int, profile_id uuid)
language sql security definer set search_path = public as $$
  select * from public.comptable_members(p_household) $$;
grant execute on function public.test_comptables(uuid) to authenticated;

-- ---- Helpers de facturation : simulent le rôle de service (webhook Stripe).
-- ---- Le client ne peut pas appeler grant_extension ni upsert_subscription ;
-- ---- les tests ont besoin de les déclencher pour vérifier leurs effets.
create or replace function public.test_accorder_extension(
  p_household uuid, p_extension text, p_session text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  return public.grant_extension(p_household, p_extension, p_session, null, null);
end $$;

create or replace function public.test_abonner(
  p_household uuid, p_plan text, p_status text,
  p_fin timestamptz, p_resiliation boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.upsert_subscription(p_household, p_plan, p_status,
    'cus_test', 'sub_test', 'price_test', p_fin, p_resiliation, null);
end $$;

create or replace function public.test_enregistrer_evenement(
  p_event text, p_type text, p_household uuid, p_payload jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return public.record_billing_event(p_event, p_type, p_household, p_payload);
end $$;

create or replace function public.test_confirmer_evenement(p_event text) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.confirm_billing_event(p_event); end $$;

grant execute on function public.test_confirmer_evenement(text) to authenticated;
grant execute on function public.test_accorder_extension(uuid, text, text) to authenticated;
grant execute on function public.test_abonner(uuid, text, text, timestamptz, boolean) to authenticated;
grant execute on function public.test_enregistrer_evenement(text, text, uuid, jsonb) to authenticated;

-- ---- Helpers de tarification : seul le rôle de service modifie les prix.
create or replace function public.test_fixer_prix(p_mensuel bigint, p_annuel bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update plans set price_cents_monthly = p_mensuel, price_cents_yearly = p_annuel
   where id = 'premium';
end $$;

create or replace function public.test_fixer_tarifs_stripe(p_mois text, p_an text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update plans set stripe_price_id_monthly = p_mois, stripe_price_id_yearly = p_an
   where id = 'premium';
end $$;

grant execute on function public.test_fixer_prix(bigint, bigint) to authenticated;
grant execute on function public.test_fixer_tarifs_stripe(text, text) to authenticated;

-- ---- Import du calendrier scolaire : réservé au rôle de service en production.
create or replace function public.test_importer_vacances(p_periodes jsonb)
returns int language plpgsql security definer set search_path = public as $$
begin
  return public.import_school_holidays(p_periodes);
end $$;
grant execute on function public.test_importer_vacances(jsonb) to authenticated;

-- ---- Activation d'un pays : opération d'administration, hors du client.
create or replace function public.test_activer_pays(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin update calendar_countries set active = true where code = p_code; end $$;

create or replace function public.test_desactiver_pays(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin update calendar_countries set active = false where code = p_code; end $$;

create or replace function public.test_importer_correspondances(p_pays text, p_lignes jsonb)
returns int language plpgsql security definer set search_path = public as $$
begin return public.import_area_zones(p_pays, p_lignes); end $$;

grant execute on function public.test_activer_pays(text) to authenticated;
grant execute on function public.test_desactiver_pays(text) to authenticated;
grant execute on function public.test_importer_correspondances(text, jsonb) to authenticated;

/** Compte les pays déclarés, actifs ou non : la RLS ne montre que les actifs. */
create or replace function public.test_pays_declares()
returns table (code text, mode text, actif boolean)
language sql security definer set search_path = public as $$
  select c.code, c.zone_mode, c.active from calendar_countries c order by c.sort_order
$$;
grant execute on function public.test_pays_declares() to authenticated;

/** Ajout d'un type de période : opération d'administration. */
create or replace function public.test_ajouter_type_exception(
  p_code text, p_label text, p_priorite smallint)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into exception_types (code, label, priority, sort_order)
  values (p_code, p_label, p_priorite, 90)
  on conflict (code) do update set label = excluded.label, priority = excluded.priority;
end $$;
grant execute on function public.test_ajouter_type_exception(text, text, smallint) to authenticated;

-- Comptes servant aux tests du parent provisoire
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'premier@test.fr'),
  ('00000000-0000-0000-0000-0000000000e2', 'second@test.fr')
on conflict (id) do nothing;
insert into profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000000e1', 'premier@test.fr', 'Premier'),
  ('00000000-0000-0000-0000-0000000000e2', 'second@test.fr', 'Second')
on conflict (id) do nothing;

/** La fusion est réservée au serveur ; les tests ont besoin de la déclencher. */
create or replace function public.test_fusionner(p_household uuid, p_reel uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin return public.fusionner_parent_provisoire(p_household, p_reel); end $$;
grant execute on function public.test_fusionner(uuid, uuid) to authenticated;

/** Année scolaire courante, telle que la calcule propositions_vacances. */
create or replace function public.test_annee_scolaire() returns text
language sql stable as $$
  select case when extract(month from current_date) >= 8
         then extract(year from current_date)::text || '-' || (extract(year from current_date) + 1)::text
         else (extract(year from current_date) - 1)::text || '-' || extract(year from current_date)::text
    end
$$;
grant execute on function public.test_annee_scolaire() to authenticated;

/** Émission directe d'une notification : réservée au serveur en production. */
create or replace function public.test_notifier(
  p_household uuid, p_type text, p_titre text, p_corps text,
  p_quand timestamptz, p_destinataire uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  return public.notifier(p_household, p_type, p_titre, p_corps, '/app/planning',
                         null, null, null, p_quand, p_destinataire);
end $$;
grant execute on function public.test_notifier(uuid, text, text, text, timestamptz, uuid) to authenticated;

/** Comptage sans RLS : les notifications d'un parent sont invisibles à l'autre. */
create or replace function public.test_compter_notifs(p_profil uuid, p_type text default null)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from notifications
   where profile_id = p_profil and (p_type is null or kind = p_type)
$$;
grant execute on function public.test_compter_notifs(uuid, text) to authenticated;

create or replace function public.test_compter_non_lues_dues(p_profil uuid, p_household uuid)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from notifications
   where profile_id = p_profil and household_id = p_household
     and read_at is null and scheduled_at <= now()
$$;
grant execute on function public.test_compter_non_lues_dues(uuid, uuid) to authenticated;

-- ---- Programmation des rappels : réservée au rôle de service en production.
create or replace function public.test_programmer_rdv(p_household uuid) returns int
language plpgsql security definer set search_path = public as $$
begin return public.programmer_rappels_rendez_vous(p_household); end $$;

create or replace function public.test_programmer_vacances(p_household uuid) returns int
language plpgsql security definer set search_path = public as $$
begin return public.programmer_rappels_vacances(p_household); end $$;

create or replace function public.test_programmer_changement(
  p_household uuid, p_date date, p_parent uuid, p_heure time) returns int
language plpgsql security definer set search_path = public as $$
begin return public.programmer_rappel_changement(p_household, p_date, p_parent, p_heure); end $$;

create or replace function public.test_purger_rappels(p_household uuid) returns int
language plpgsql security definer set search_path = public as $$
begin return public.purger_rappels_obsoletes(p_household); end $$;

create or replace function public.test_programmer_rappel(
  p_household uuid, p_type text, p_dest uuid, p_titre text, p_corps text,
  p_entity text, p_entity_id uuid, p_quand timestamptz) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return public.programmer_rappel(p_household, p_type, p_dest, p_titre, p_corps,
                                  '/app/planning', p_entity, p_entity_id, p_quand);
end $$;

create or replace function public.test_definir_delai(
  p_profil uuid, p_household uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into reminder_settings (profile_id, household_id, minutes_avant)
  values (p_profil, p_household, p_minutes)
  on conflict (profile_id, household_id) do update set minutes_avant = excluded.minutes_avant;
end $$;

grant execute on function public.test_programmer_rdv(uuid) to authenticated;
grant execute on function public.test_programmer_vacances(uuid) to authenticated;
grant execute on function public.test_programmer_changement(uuid, date, uuid, time) to authenticated;
grant execute on function public.test_purger_rappels(uuid) to authenticated;
grant execute on function public.test_programmer_rappel(uuid, text, uuid, text, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.test_definir_delai(uuid, uuid, int) to authenticated;

/** Manipulation directe des notifications, pour les tests d'idempotence. */
create or replace function public.test_purger_notifs(p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin delete from notifications where kind = p_kind; end $$;

create or replace function public.test_marquer_lu_direct(p_kind text, p_entity uuid, p_profil uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update notifications set read_at = now()
   where kind = p_kind and entity_id = p_entity and profile_id = p_profil;
end $$;

create or replace function public.test_rappel_horaire(p_kind text, p_entity uuid, p_profil uuid)
returns table (quand timestamptz, lu timestamptz, corps text, titre text)
language sql security definer set search_path = public as $$
  select scheduled_at, read_at, body, title from notifications
   where kind = p_kind and entity_id = p_entity and profile_id = p_profil
$$;

grant execute on function public.test_purger_notifs(text) to authenticated;
grant execute on function public.test_marquer_lu_direct(text, uuid, uuid) to authenticated;
grant execute on function public.test_rappel_horaire(text, uuid, uuid) to authenticated;

create or replace function public.test_compter_notifs_type(p_kind text) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from notifications where kind = p_kind
$$;
create or replace function public.test_compter_notifs_entite(p_kind text, p_entity uuid) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from notifications where kind = p_kind and entity_id = p_entity
$$;
grant execute on function public.test_compter_notifs_type(text) to authenticated;
grant execute on function public.test_compter_notifs_entite(text, uuid) to authenticated;

create or replace function public.test_compter_notifs_destinataire(
  p_kind text, p_entity uuid, p_profil uuid) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from notifications
   where kind = p_kind and entity_id = p_entity and profile_id = p_profil
$$;
grant execute on function public.test_compter_notifs_destinataire(text, uuid, uuid) to authenticated;

/** Force l'expiration d'une invitation, pour tester le garde-fou. */
create or replace function public.test_expirer_invitation(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update invitations set expires_at = now() - interval '1 day' where token = p_token;
end $$;
grant execute on function public.test_expirer_invitation(uuid) to authenticated;

/** Nombre de tentatives sur une invitation, hors RLS. */
create or replace function public.test_tentatives_invitation(p_token uuid) returns int
language sql security definer set search_path = public as $$
  select coalesce(tentatives, 0)::int from invitations where token = p_token
$$;
grant execute on function public.test_tentatives_invitation(uuid) to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f5', 'destinataire1@test.fr'),
  ('00000000-0000-0000-0000-0000000000f6', 'destinataire2@test.fr')
on conflict (id) do nothing;
insert into profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000000f5', 'destinataire1@test.fr', 'Destinataire 1'),
  ('00000000-0000-0000-0000-0000000000f6', 'destinataire2@test.fr', 'Destinataire 2')
on conflict (id) do nothing;
