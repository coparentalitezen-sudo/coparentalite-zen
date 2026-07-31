-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00020 : droits du rôle de service
--
-- DÉFAUT CORRIGÉ
-- Les migrations 00015, 00017 et 00018 révoquent l'exécution de leurs
-- fonctions d'administration pour public, anon et authenticated — c'est
-- volontaire : un utilisateur ne doit pouvoir ni s'offrir un abonnement, ni
-- modifier le calendrier scolaire national.
--
-- Mais « revoke from public » retire aussi le droit implicite dont héritait
-- service_role, le rôle employé par les traitements sans utilisateur : import
-- du calendrier officiel et webhook Stripe. Ces traitements échouaient donc
-- sur « permission denied for function », sans que rien ne soit écrit —
-- l'import se déclarait impossible sans qu'on sache pourquoi, et un paiement
-- encaissé n'aurait crédité aucun foyer.
--
-- Cette migration accorde explicitement ces droits à service_role, et à lui
-- seul. Les rôles clients restent exclus.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

do $$
begin
  -- service_role existe sur Supabase ; hors Supabase, on ne fait rien.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise notice 'service_role absent : rien à accorder (environnement hors Supabase)';
    return;
  end if;

  -- ---------- Calendrier scolaire officiel ----------
  execute 'grant execute on function public.import_school_holidays(jsonb) to service_role';
  execute 'grant execute on function public.log_calendar_sync(text, text, int, text, text) to service_role';

  -- import_area_zones n'existe qu'à partir de la migration 00018
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'import_area_zones') then
    execute 'grant execute on function public.import_area_zones(text, jsonb) to service_role';
  end if;

  -- ---------- Facturation ----------
  execute 'grant execute on function public.grant_extension(uuid, text, text, text, bigint) to service_role';
  execute 'grant execute on function public.upsert_subscription(uuid, text, text, text, text, text, timestamptz, boolean, timestamptz) to service_role';
  execute 'grant execute on function public.record_billing_event(text, text, uuid, jsonb) to service_role';
  execute 'grant execute on function public.confirm_billing_event(text) to service_role';
  execute 'grant execute on function public.fail_billing_event(text, text) to service_role';

  -- ---------- Lectures nécessaires aux mêmes traitements ----------
  -- Le webhook et l'import lisent des tables pour se situer ; la clé de
  -- service contourne la RLS mais a besoin du privilège de table.
  execute 'grant select on public.plan_extensions, public.plans, public.households,'
       || ' public.calendar_countries, public.calendar_zones, public.school_calendar_syncs'
       || ' to service_role';
end $$;

commit;
