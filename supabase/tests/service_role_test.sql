-- ============================================================
-- TESTS — droits du rôle de service (S1 à S6)
--
-- Ces tests existent parce qu'un « permission denied for function » a atteint
-- la production : les fonctions d'administration étaient révoquées pour tous
-- les rôles, service_role compris. L'import du calendrier échouait sans rien
-- écrire, et le webhook Stripe aurait encaissé sans créditer.
-- ============================================================
\set ON_ERROR_STOP on

-- ============ S1 : le rôle de service peut importer le calendrier ============
do $$
declare n int;
begin
  set local role service_role;
  n := public.import_school_holidays('[
    {"country_code":"FR","label":"Test service","zone":"A","school_year":"2026-2027",
     "starts_on":"2026-10-17","ends_on":"2026-11-02"}]'::jsonb);
  reset role;
  if n <> 1 then raise exception 'ÉCHEC S1 : % période importée', n; end if;
  raise notice 'S1 OK — le rôle de service importe le calendrier officiel';
exception when insufficient_privilege then
  reset role;
  raise exception 'ÉCHEC S1 : permission refusée au rôle de service — l''import est impossible en production';
end $$;

-- ============ S2 : il peut journaliser une synchronisation ============
do $$
begin
  set local role service_role;
  perform public.log_calendar_sync(null, '2026-2027', 1, 'succes', 'test');
  reset role;
  raise notice 'S2 OK — journalisation possible pour le rôle de service';
exception when insufficient_privilege then
  reset role;
  raise exception 'ÉCHEC S2 : sans ce droit, aucun échec d''import ne laisse de trace';
end $$;

-- ============ S3 : il peut rattacher les académies ============
do $$
declare n int;
begin
  set local role service_role;
  n := public.import_area_zones('FR', '[{"area_code":"75","area_label":"Paris","zone_code":"C"}]'::jsonb);
  reset role;
  if n <> 1 then raise exception 'ÉCHEC S3 : % correspondance', n; end if;
  raise notice 'S3 OK — correspondances académie/zone accessibles au rôle de service';
exception when insufficient_privilege then
  reset role;
  raise exception 'ÉCHEC S3 : permission refusée';
end $$;

-- ============ S4 : il peut créditer une extension payée ============
do $$
declare rid uuid;
begin
  set local role service_role;
  rid := public.grant_extension('aaaaaaaa-0000-0000-0000-000000000001', 'ext_1m', 'sess_service_test');
  reset role;
  if rid is null then raise exception 'ÉCHEC S4 : aucune extension créditée'; end if;
  raise notice 'S4 OK — le webhook peut créditer un paiement';
exception when insufficient_privilege then
  reset role;
  raise exception 'ÉCHEC S4 : un paiement encaissé ne créditerait aucun foyer';
end $$;

-- ============ S5 : il peut enregistrer un abonnement ============
do $$
begin
  set local role service_role;
  perform public.upsert_subscription('aaaaaaaa-0000-0000-0000-000000000001', 'premium', 'active',
    'cus_srv', 'sub_srv', null, now() + interval '30 days', false, null);
  perform public.record_billing_event('evt_srv_test', 'checkout.session.completed',
    'aaaaaaaa-0000-0000-0000-000000000001', '{}'::jsonb);
  perform public.confirm_billing_event('evt_srv_test');
  reset role;
  raise notice 'S5 OK — abonnement et journal de facturation accessibles au rôle de service';
exception when insufficient_privilege then
  reset role;
  raise exception 'ÉCHEC S5 : un abonnement payé ne serait jamais activé';
end $$;

-- ============ S6 : les rôles clients restent exclus ============
do $$
declare bloques int := 0;
begin
  set local role authenticated;
  begin
    perform public.import_school_holidays('[{"country_code":"FR","label":"Faux","zone":"A",
      "school_year":"2026-2027","starts_on":"2026-01-01","ends_on":"2026-01-10"}]'::jsonb);
  exception when others then bloques := bloques + 1;
  end;
  begin
    perform public.grant_extension('aaaaaaaa-0000-0000-0000-000000000001', 'ext_12m', 'faux');
  exception when others then bloques := bloques + 1;
  end;
  begin
    perform public.upsert_subscription('aaaaaaaa-0000-0000-0000-000000000001', 'premium',
      'active', null, null, null, null, false, null);
  exception when others then bloques := bloques + 1;
  end;
  reset role;
  if bloques <> 3 then
    raise exception 'ÉCHEC S6 : le rôle applicatif accède aux fonctions d''administration (%/3 bloquées)', bloques;
  end if;
  raise notice 'S6 OK — le rôle applicatif reste exclu des fonctions d''administration';
end $$;

select 'TESTS DES DROITS DE SERVICE PASSÉS' as resultat;
