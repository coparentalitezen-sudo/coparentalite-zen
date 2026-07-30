-- ============================================================
-- TESTS — offres, horizon de planning et facturation (P1 à P14)
-- Foyer A : Alice (owner), Bob (parent), Mia (mediator). Enfant : Léa.
-- ============================================================
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ P1 : offre gratuite, trois mois offerts ============
do $$
declare e record; attendu date;
begin
  select * into e from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  if e.plan_id <> 'free' then raise exception 'ÉCHEC P1 : plan % au lieu de free', e.plan_id; end if;
  if e.illimite then raise exception 'ÉCHEC P1b : horizon illimité sans abonnement'; end if;
  if e.mois_offerts <> 3 then raise exception 'ÉCHEC P1c : % mois offerts au lieu de 3', e.mois_offerts; end if;
  if e.mois_ajoutes <> 0 then raise exception 'ÉCHEC P1d : extensions fantômes'; end if;
  select (h.created_at + interval '3 months')::date into attendu
    from households h where h.id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if e.horizon <> attendu then
    raise exception 'ÉCHEC P1e : horizon % au lieu de %', e.horizon, attendu;
  end if;
  raise notice 'P1 OK — offre gratuite : 3 mois, horizon au %', e.horizon;
end $$;

-- ============ P2 : le planning refuse une date au-delà de l'horizon ============
do $$
declare e record; msg text;
begin
  select * into e from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    perform public.create_custody_exception(
      'aaaaaaaa-0000-0000-0000-000000000001', 'holiday',
      array['cccccccc-0000-0000-0000-000000000001']::uuid[],
      '00000000-0000-0000-0000-00000000000a',
      (e.horizon + 10)::timestamptz, (e.horizon + 20)::timestamptz, 'Trop loin', null);
    raise exception 'ÉCHEC P2 : période acceptée au-delà de l''horizon';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    msg := sqlerrm;
  end;
  if msg not like '%planning gratuit couvre%' then
    raise exception 'ÉCHEC P2b : message peu clair (%)', msg;
  end if;
  raise notice 'P2 OK — au-delà de l''horizon refusé : %', left(msg, 60);
end $$;

-- ============ P3 : dans l'horizon, tout fonctionne ============
do $$
declare ids uuid[];
begin
  select array_agg(x) into ids from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'swap',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000b',
    (current_date + 5)::timestamptz, (current_date + 7)::timestamptz, 'Dans l''horizon', null) x;
  if ids is null then raise exception 'ÉCHEC P3 : période refusée alors qu''elle est couverte'; end if;
  raise notice 'P3 OK — période dans l''horizon acceptée';
end $$;

-- ============ P4 : le client ne peut pas s'accorder une extension ============
do $$
declare bloques int := 0;
begin
  begin
    perform public.grant_extension('aaaaaaaa-0000-0000-0000-000000000001', 'ext_12m', 'faux_session');
  exception when insufficient_privilege then bloques := bloques + 1;
    when others then bloques := bloques + 1;
  end;
  begin
    insert into household_extensions (household_id, extension_id, months, amount_cents)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'ext_12m', 12, 0);
  exception when insufficient_privilege then bloques := bloques + 1;
    when others then bloques := bloques + 1;
  end;
  if bloques <> 2 then
    raise exception 'ÉCHEC P4 : le client peut s''octroyer des mois (%/2 bloqués)', bloques;
  end if;
  raise notice 'P4 OK — extension impossible depuis le client, par fonction comme en direct';
end $$;

-- ============ P5 : le client ne peut pas s'accorder un abonnement ============
do $$
declare bloques int := 0;
begin
  begin
    perform public.upsert_subscription('aaaaaaaa-0000-0000-0000-000000000001','premium','active',
      'cus_faux','sub_faux',null, now() + interval '1 year', false, null);
  exception when others then bloques := bloques + 1;
  end;
  begin
    insert into subscriptions (household_id, plan_id, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001','premium','active');
  exception when others then bloques := bloques + 1;
  end;
  if bloques <> 2 then
    raise exception 'ÉCHEC P5 : le client peut s''abonner sans payer (%/2 bloqués)', bloques;
  end if;
  raise notice 'P5 OK — abonnement impossible depuis le client';
end $$;

-- ============ P6 : une extension accordée par le serveur repousse l'horizon ============
do $$
declare avant date; apres record;
begin
  select horizon into avant from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  perform public.test_accorder_extension('aaaaaaaa-0000-0000-0000-000000000001', 'ext_6m', 'sess_test_6m');
  select * into apres from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  if apres.mois_ajoutes <> 6 then
    raise exception 'ÉCHEC P6 : % mois ajoutés au lieu de 6', apres.mois_ajoutes;
  end if;
  if apres.horizon <= avant then
    raise exception 'ÉCHEC P6b : horizon non repoussé (% -> %)', avant, apres.horizon;
  end if;
  raise notice 'P6 OK — +6 mois : horizon repoussé du % au %', avant, apres.horizon;
end $$;

-- ============ P7 : extensions cumulables ============
do $$
declare e record;
begin
  perform public.test_accorder_extension('aaaaaaaa-0000-0000-0000-000000000001', 'ext_1m', 'sess_test_1m');
  perform public.test_accorder_extension('aaaaaaaa-0000-0000-0000-000000000001', 'ext_12m', 'sess_test_12m');
  select * into e from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  if e.mois_ajoutes <> 19 then
    raise exception 'ÉCHEC P7 : % mois cumulés au lieu de 19', e.mois_ajoutes;
  end if;
  raise notice 'P7 OK — extensions cumulées : % mois ajoutés', e.mois_ajoutes;
end $$;

-- ============ P8 : rejeu d'un webhook, aucun double crédit ============
do $$
declare e1 record; e2 record;
begin
  select * into e1 from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  perform public.test_accorder_extension('aaaaaaaa-0000-0000-0000-000000000001', 'ext_6m', 'sess_test_6m');
  select * into e2 from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  if e1.mois_ajoutes <> e2.mois_ajoutes then
    raise exception 'ÉCHEC P8 : double crédit (% -> %)', e1.mois_ajoutes, e2.mois_ajoutes;
  end if;
  raise notice 'P8 OK — même session Stripe rejouée : aucun double crédit';
end $$;

-- ============ P9 : événement de facturation idempotent ============
do $$
declare premier boolean; second boolean;
begin
  premier := public.test_enregistrer_evenement('evt_test_1', 'checkout.session.completed',
              'aaaaaaaa-0000-0000-0000-000000000001', '{}'::jsonb);
  if not premier then raise exception 'ÉCHEC P9 : premier enregistrement refusé'; end if;
  -- traitement mené à bien : l'événement est clos
  perform public.test_confirmer_evenement('evt_test_1');
  second  := public.test_enregistrer_evenement('evt_test_1', 'checkout.session.completed',
              'aaaaaaaa-0000-0000-0000-000000000001', '{}'::jsonb);
  if second then raise exception 'ÉCHEC P9b : rejeu accepté après traitement réussi'; end if;
  raise notice 'P9 OK — un événement abouti n''est jamais retraité';
end $$;

-- ============ P9b : un événement échoué reste rejouable ============
do $$
declare premier boolean; rejeu boolean; apres boolean;
begin
  premier := public.test_enregistrer_evenement('evt_test_2', 'invoice.paid',
              'aaaaaaaa-0000-0000-0000-000000000001', '{}'::jsonb);
  -- traitement en échec : on ne confirme pas
  rejeu := public.test_enregistrer_evenement('evt_test_2', 'invoice.paid',
              'aaaaaaaa-0000-0000-0000-000000000001', '{}'::jsonb);
  if not premier then raise exception 'ÉCHEC P9b : premier passage refusé'; end if;
  if not rejeu then
    raise exception 'ÉCHEC P9b : un événement échoué est considéré traité — le paiement serait perdu';
  end if;
  -- après confirmation, le rejeu doit être refusé
  perform public.test_confirmer_evenement('evt_test_2');
  apres := public.test_enregistrer_evenement('evt_test_2', 'invoice.paid',
              'aaaaaaaa-0000-0000-0000-000000000001', '{}'::jsonb);
  if apres then raise exception 'ÉCHEC P9c : rejeu accepté après traitement réussi'; end if;
  raise notice 'P9b OK — échec rejouable, succès non rejouable';
end $$;

-- ============ P10 : abonnement actif → horizon illimité ============
do $$
declare e record;
begin
  perform public.test_abonner('aaaaaaaa-0000-0000-0000-000000000001', 'premium', 'active',
                              now() + interval '30 days', false);
  select * into e from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  if not e.illimite then raise exception 'ÉCHEC P10 : horizon toujours borné avec abonnement actif'; end if;
  if e.horizon is not null then raise exception 'ÉCHEC P10b : horizon renseigné alors qu''illimité'; end if;
  if not e.abonnement_actif then raise exception 'ÉCHEC P10c : abonnement non signalé actif'; end if;
  if e.plan_id <> 'premium' then raise exception 'ÉCHEC P10d : plan % au lieu de premium', e.plan_id; end if;
  raise notice 'P10 OK — abonnement actif : planning illimité';
end $$;

-- ============ P11 : avec abonnement, une date lointaine est acceptée ============
do $$
declare ids uuid[];
begin
  select array_agg(x) into ids from public.create_custody_exception(
    'aaaaaaaa-0000-0000-0000-000000000001', 'holiday',
    array['cccccccc-0000-0000-0000-000000000001']::uuid[],
    '00000000-0000-0000-0000-00000000000a',
    (current_date + 900)::timestamptz, (current_date + 910)::timestamptz, 'Loin devant', null) x;
  if ids is null then raise exception 'ÉCHEC P11 : période refusée malgré l''abonnement'; end if;
  raise notice 'P11 OK — planification lointaine possible avec Zen Plus';
end $$;

-- ============ P12 : abonnement expiré → retour à l'offre gratuite ============
do $$
declare e record;
begin
  perform public.test_abonner('aaaaaaaa-0000-0000-0000-000000000001', 'premium', 'active',
                              now() - interval '1 day', false);
  select * into e from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  if e.illimite then raise exception 'ÉCHEC P12 : illimité alors que la période est échue'; end if;
  if e.plan_id <> 'free' then raise exception 'ÉCHEC P12b : plan % au lieu de free', e.plan_id; end if;
  -- les mois achetés restent acquis : ils ont été payés
  if e.mois_ajoutes <> 19 then
    raise exception 'ÉCHEC P12c : extensions perdues (% mois)', e.mois_ajoutes;
  end if;
  raise notice 'P12 OK — abonnement échu : retour au gratuit, extensions conservées';
end $$;

-- ============ P13 : résiliation programmée signalée, accès maintenu ============
do $$
declare e record;
begin
  perform public.test_abonner('aaaaaaaa-0000-0000-0000-000000000001', 'premium', 'active',
                              now() + interval '20 days', true);
  select * into e from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  if not e.illimite then raise exception 'ÉCHEC P13 : accès coupé avant la fin de période payée'; end if;
  if not e.resiliation_programmee then raise exception 'ÉCHEC P13b : résiliation non signalée'; end if;
  raise notice 'P13 OK — résiliation programmée : accès maintenu jusqu''au terme payé';
end $$;

-- ============ P14 : isolation — un foyer étranger n'accède à rien ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  begin
    perform public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'ÉCHEC P14 : droits d''un foyer étranger consultables';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  select count(*) into n from household_extensions
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'ÉCHEC P14b : % extensions visibles depuis un autre foyer', n; end if;
  select count(*) into n from billing_events
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'ÉCHEC P14c : événements de facturation visibles'; end if;
  raise notice 'P14 OK — offres, extensions et facturation isolées par foyer';
end $$;

-- ============ P15 : le second parent voit les droits du foyer ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare e record;
begin
  select * into e from public.household_entitlement('aaaaaaaa-0000-0000-0000-000000000001');
  if e.plan_id is null then raise exception 'ÉCHEC P15 : le second parent ne voit pas l''offre'; end if;
  raise notice 'P15 OK — les deux parents voient la même offre (%)', e.plan_id;
end $$;

-- ============ P16 : la médiatrice ne voit pas les écritures de facturation ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$
declare n int;
begin
  select count(*) into n from billing_events
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'ÉCHEC P16 : la médiatrice lit % écriture(s) de facturation', n; end if;
  raise notice 'P16 OK — facturation réservée au propriétaire du foyer';
end $$;

select 'TESTS DES OFFRES ET DE L''HORIZON PASSÉS' as resultat;
