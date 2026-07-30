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
