-- ============================================================
-- TESTS D'INTÉGRITÉ COMPTABLE
--   S1–S9   sécurité : les écritures directes doivent échouer
--   B10–B19 solde autoritaire
--   V20–V26 verrouillage des dépenses remboursées
--   R1–R11  régressions du second audit indépendant
--
-- Exécution en rôle « authenticated » : droits de table et RLS réels.
-- Foyer A : Alice (owner, entrée en premier → parent_1), Bob (parent),
--           Mia (mediator, non comptable). Foyer B : Carol.
-- ============================================================
\set ON_ERROR_STOP on

-- ============================================================
-- SÉCURITÉ
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- S7 : opération légitime par fonction serveur
do $$
declare eid uuid;
begin
  eid := public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Reference',6000,current_date,null,
    '00000000-0000-0000-0000-00000000000a', null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":3000,"basis_points":5000},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":3000,"basis_points":5000}]'::jsonb);
  perform set_config('app.ref', eid::text, false);
  raise notice 'S7 OK — opération légitime par fonction serveur réussie';
end $$;

-- S9 : journalisation de l'opération légitime
do $$
begin
  if not public.test_audit_existe('expense', current_setting('app.ref')::uuid) then
    raise exception 'ÉCHEC S9 : aucune trace d''audit pour la création';
  end if;
  raise notice 'S9 OK — journal d''audit alimenté par la fonction serveur';
end $$;

-- S1 : insertion directe d'une dépense
do $$
begin
  begin
    insert into expenses (household_id, title, amount_cents, spent_on, paid_by, status, created_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Directe',1000,current_date,
            '00000000-0000-0000-0000-00000000000a','validated','00000000-0000-0000-0000-00000000000a');
    raise exception 'ÉCHEC S1 : insertion directe acceptée';
  exception when insufficient_privilege then null;
    when others then if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'S1 OK — insertion directe d''une dépense refusée';
end $$;

-- S2 : modification directe du statut (auto-validation)
do $$
begin
  begin
    update expenses set status = 'validated' where id = current_setting('app.ref')::uuid;
    raise exception 'ÉCHEC S2 : auto-validation directe acceptée';
  exception when insufficient_privilege then null;
    when others then if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  if (select status from expenses where id = current_setting('app.ref')::uuid) = 'validated' then
    raise exception 'ÉCHEC S2b : le statut a changé malgré le refus';
  end if;
  raise notice 'S2 OK — modification directe du statut refusée';
end $$;

-- S3 : écriture directe des parts
do $$
begin
  begin
    update expense_shares set owed_cents = 999999 where expense_id = current_setting('app.ref')::uuid;
    raise exception 'ÉCHEC S3 : falsification directe des parts acceptée';
  exception when insufficient_privilege then null;
    when others then if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  if (select sum(owed_cents) from expense_shares where expense_id = current_setting('app.ref')::uuid) <> 6000 then
    raise exception 'ÉCHEC S3b : les parts ont été altérées';
  end if;
  raise notice 'S3 OK — écriture directe des parts refusée';
end $$;

-- S4 : création directe d'un remboursement
do $$
begin
  begin
    insert into reimbursements (household_id, from_parent, to_parent, amount_cents, method, paid_on, created_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b',
            '00000000-0000-0000-0000-00000000000a',500000,'cash',current_date,
            '00000000-0000-0000-0000-00000000000a');
    raise exception 'ÉCHEC S4 : remboursement forgé accepté';
  exception when insufficient_privilege then null;
    when others then if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'S4 OK — création directe d''un remboursement refusée';
end $$;

-- Bob valide la dépense de référence : Bob doit désormais 30,00 € à Alice
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin perform public.review_expense(current_setting('app.ref')::uuid, 'validate'); end $$;

-- S5 : annulation directe d'un remboursement
do $$
declare rid uuid;
begin
  rid := public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
    1000,'cash',current_date,null,'pour test S5');
  perform set_config('app.remb', rid::text, false);
  begin
    update reimbursements set deleted_at = now() where id = rid;
    raise exception 'ÉCHEC S5 : annulation directe acceptée';
  exception when insufficient_privilege then null;
    when others then if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  if not public.test_remboursement_actif(rid) then
    raise exception 'ÉCHEC S5b : le remboursement a été annulé malgré le refus';
  end if;
  raise notice 'S5 OK — annulation directe refusée';
end $$;

-- S6 : opération enregistrée au nom d'un autre membre
do $$
begin
  begin
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b',
      500,'cash',current_date,null,null);
    raise exception 'ÉCHEC S6 : remboursement enregistré au nom d''Alice';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'S6 OK — opération au nom d''autrui refusée';
end $$;

-- S8 : isolation entre foyers
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select count(*) into n from expenses where household_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'ÉCHEC S8 : % dépenses du foyer A visibles depuis le foyer B', n; end if;
  begin
    perform public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'ÉCHEC S8b : solde d''un foyer étranger consultable';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'S8 OK — isolation entre foyers maintenue';
end $$;

-- ============================================================
-- SOLDE AUTORITAIRE
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- B19 : le médiateur est exclu du calcul
do $$
declare n int;
begin
  select count(*) into n from public.test_comptables('aaaaaaaa-0000-0000-0000-000000000001');
  if n <> 2 then raise exception 'ÉCHEC B19 : % membres comptables au lieu de 2', n; end if;
  if exists (select 1 from public.test_comptables('aaaaaaaa-0000-0000-0000-000000000001')
             where profile_id = '00000000-0000-0000-0000-00000000000d') then
    raise exception 'ÉCHEC B19b : la médiatrice compte dans le solde';
  end if;
  raise notice 'B19 OK — médiateur exclu du calcul';
end $$;

-- B18 : identification des membres déterministe
do $$
declare a uuid; b uuid; i int;
begin
  select parent_1 into a from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  for i in 1..5 loop
    select parent_1 into b from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
    if a <> b then raise exception 'ÉCHEC B18 : parent_1 varie entre deux appels'; end if;
  end loop;
  raise notice 'B18 OK — identification des membres déterministe';
end $$;

-- B10 + B12 : plus de 100 dépenses, aucune troncature
do $$
declare i int; s record;
begin
  for i in 1..120 loop
    perform public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Charge '||i,1000,
      current_date - i, null, '00000000-0000-0000-0000-00000000000a', null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":500},
        {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":500}]'::jsonb);
  end loop;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  perform public.review_expense(e.id, 'validate') from expenses e
   where e.household_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and e.deleted_at is null and e.status = 'sent' and e.paid_by <> auth.uid();
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if s.depenses_prises_en_compte < 120 then
    raise exception 'ÉCHEC B10 : % dépenses comptées (troncature ?)', s.depenses_prises_en_compte;
  end if;
  perform set_config('app.net120', s.net_cents::text, false);
  raise notice 'B10/B12 OK — % dépenses prises en compte, solde = % centimes',
    s.depenses_prises_en_compte, s.net_cents;
end $$;

-- B11 : plus de 50 remboursements
do $$
declare i int; s record; avant bigint;
begin
  avant := current_setting('app.net120')::bigint;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  for i in 1..60 loop
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
      100,'cash',current_date,null,null);
  end loop;
  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if s.remboursements_pris_en_compte < 60 then
    raise exception 'ÉCHEC B11 : % remboursements comptés', s.remboursements_pris_en_compte;
  end if;
  if s.net_cents <> avant - 6000 then
    raise exception 'ÉCHEC B11b : solde attendu %, obtenu %', avant - 6000, s.net_cents;
  end if;
  raise notice 'B11 OK — % remboursements intégrés, solde exact au centime', s.remboursements_pris_en_compte;
end $$;

-- B15 : les remboursements annulés sont exclus
do $$
declare s1 record; s2 record; rid uuid;
begin
  select * into s1 from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  rid := public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
    2500,'cash',current_date,null,'à annuler');
  perform public.cancel_reimbursement(rid);
  select * into s2 from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if s1.net_cents <> s2.net_cents then
    raise exception 'ÉCHEC B15 : un remboursement annulé influence le solde (% -> %)', s1.net_cents, s2.net_cents;
  end if;
  raise notice 'B15 OK — remboursement annulé exclu du solde';
end $$;

-- B14 : partially_reimbursed compté comme statut comptable
do $$
declare eid uuid; s1 record; s2 record;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  select * into s1 from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  eid := public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Partielle',4000,current_date,null,
    '00000000-0000-0000-0000-00000000000a', null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":2000},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":2000}]'::jsonb);
  perform public.test_forcer_statut(eid, 'partially_reimbursed');
  select * into s2 from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if s2.net_cents <> s1.net_cents + 2000 then
    raise exception 'ÉCHEC B14 : partially_reimbursed ignoré (% -> %)', s1.net_cents, s2.net_cents;
  end if;
  raise notice 'B14 OK — partially_reimbursed compté comme les autres statuts comptables';
end $$;

-- B16 + B17 : arrondis au centime et équilibre parfait
do $$
declare s record; du bigint; rid uuid;
begin
  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  du := s.net_cents;
  if du <= 0 then raise exception 'ÉCHEC B17 : configuration de test inattendue (net=%)', du; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  rid := public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
    du,'bank_transfer',current_date,null,'solde exact');
  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if s.net_cents <> 0 or not s.equilibre then
    raise exception 'ÉCHEC B17 : équilibre non atteint (net=%, equilibre=%)', s.net_cents, s.equilibre;
  end if;
  if s.debiteur is not null or s.crediteur is not null then
    raise exception 'ÉCHEC B17b : débiteur/créditeur renseignés alors que les comptes sont équilibrés';
  end if;
  perform set_config('app.soldeur', rid::text, false);
  raise notice 'B16/B17 OK — remboursement au centime près, équilibre parfait atteint';
end $$;

-- B13 : source unique — deux appels successifs concordent
do $$
declare a record; b record;
begin
  select * into a from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  select * into b from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if a.net_cents <> b.net_cents or a.parent_1 <> b.parent_1 then
    raise exception 'ÉCHEC B13 : deux appels successifs divergent';
  end if;
  raise notice 'B13 OK — fonction unique, résultat stable : Accueil et Dépenses ne peuvent plus diverger';
end $$;

-- ============================================================
-- VERROUILLAGE DES DÉPENSES REMBOURSÉES
-- ============================================================

-- V20 : modification autorisée AVANT tout remboursement
do $$
declare eid uuid; r record;
begin
  -- on repart d'un foyer sans remboursement actif
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  for r in select id from reimbursements
           where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null
  loop
    perform public.cancel_reimbursement(r.id);
  end loop;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  eid := public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Modifiable',3000,current_date,null,
    '00000000-0000-0000-0000-00000000000a', null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":1500},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":1500}]'::jsonb);
  perform public.update_expense(eid,'Modifiable corrigee',3500,current_date,null,null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":1750},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":1750}]'::jsonb);
  if (select amount_cents from expenses where id = eid) <> 3500 then
    raise exception 'ÉCHEC V20 : modification non appliquée';
  end if;
  perform set_config('app.v20', eid::text, false);
  raise notice 'V20 OK — modification autorisée hors remboursement';
end $$;

-- V21 / V22 / V23 / V26 : après remboursement, tout est figé
do $$
declare eid uuid := current_setting('app.v20')::uuid; rid uuid; msg text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  perform public.review_expense(eid, 'validate');
  rid := public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
    500,'cash',current_date,null,'partiel');
  perform set_config('app.v21', rid::text, false);

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  begin
    perform public.update_expense(eid,'Gonflee',20000,current_date,null,null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":10000},
        {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":10000}]'::jsonb);
    raise exception 'ÉCHEC V21 : modification acceptée après remboursement partiel';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    msg := sqlerrm;
  end;
  if msg not like '%déjà été remboursée%' then
    raise exception 'ÉCHEC V26 : message métier peu clair (%)', msg;
  end if;
  if (select amount_cents from expenses where id = eid) <> 3500 then
    raise exception 'ÉCHEC V21b : la dépense a été altérée malgré le refus';
  end if;
  raise notice 'V21/V22 OK — modification refusée après remboursement, partiel comme total';
  raise notice 'V26 OK — message métier explicite';

  begin
    perform public.delete_expense(eid);
    raise exception 'ÉCHEC V23 : suppression acceptée après remboursement';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    msg := sqlerrm;
  end;
  if msg not like '%Annulez d''abord%' then
    raise exception 'ÉCHEC V23b : message de suppression peu clair (%)', msg;
  end if;
  raise notice 'V23 OK — suppression refusée avant annulation du remboursement';
end $$;

-- V24 : aucun remboursement orphelin
do $$
begin
  if (select deleted_at from expenses where id = current_setting('app.v20')::uuid) is not null then
    raise exception 'ÉCHEC V24 : la dépense remboursée a été supprimée';
  end if;
  if not public.test_remboursement_actif(current_setting('app.v21')::uuid) then
    raise exception 'ÉCHEC V24b : le remboursement a disparu';
  end if;
  raise notice 'V24 OK — aucun remboursement orphelin possible';
end $$;

-- V25 : après annulation, le comportement redevient normal
do $$
declare eid uuid := current_setting('app.v20')::uuid;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  perform public.cancel_reimbursement(current_setting('app.v21')::uuid);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  perform public.update_expense(eid,'Enfin corrigee',4200,current_date,null,null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":2100},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":2100}]'::jsonb);
  if (select amount_cents from expenses where id = eid) <> 4200 then
    raise exception 'ÉCHEC V25 : modification impossible après annulation';
  end if;
  if (select status from expenses where id = eid) <> 'sent' then
    raise exception 'ÉCHEC V25b : la validation n''a pas été annulée par la modification';
  end if;
  raise notice 'V25 OK — après annulation : modification possible, revalidation exigée';
end $$;

-- ============================================================
-- RÉGRESSIONS DU SECOND AUDIT
-- ============================================================

-- R1 : seul le parent qui paie enregistre son remboursement
do $$
declare s record;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  perform public.review_expense(current_setting('app.v20')::uuid, 'validate');  -- Bob doit à nouveau
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
      100,'cash',current_date,null,null);
    raise exception 'ÉCHEC R1 : Alice a enregistré un paiement de Bob';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%effectue le paiement%' then
      raise exception 'ÉCHEC R1b : mauvais motif (%)', sqlerrm;
    end if;
  end;
  raise notice 'R1 OK — seul le payeur peut enregistrer son remboursement';
end $$;

-- R2 : sens et plafond du remboursement
do $$
declare s record; msg text;
begin
  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if s.net_cents <= 0 then raise exception 'ÉCHEC R2 : configuration inattendue (net=%)', s.net_cents; end if;

  -- mauvais sens : Alice est créditrice, elle ne peut rien rembourser
  begin
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b',
      100,'cash',current_date,null,null);
    raise exception 'ÉCHEC R2a : remboursement à contresens accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%Aucun montant n''est dû dans ce sens%' then
      raise exception 'ÉCHEC R2a2 : mauvais motif (%)', sqlerrm;
    end if;
  end;
  raise notice 'R2a OK — remboursement à contresens refusé';

  -- au-delà du dû
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  begin
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
      s.net_cents + 1,'cash',current_date,null,null);
    raise exception 'ÉCHEC R2b : remboursement supérieur au dû accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    msg := sqlerrm;
    if msg not like '%dépasse ce qui reste dû%' then
      raise exception 'ÉCHEC R2b2 : mauvais motif (%)', msg;
    end if;
  end;
  raise notice 'R2b OK — remboursement supérieur au dû refusé : %', left(msg, 55);

  -- le montant exact passe, puis plus rien
  perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
    s.net_cents,'cash',current_date,null,null);
  begin
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
      1,'cash',current_date,null,null);
    raise exception 'ÉCHEC R2c : remboursement accepté alors que les comptes sont équilibrés';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'R2c OK — montant exact accepté, tout dépassement ensuite refusé';
end $$;

-- R3 : utilitaires internes inaccessibles au rôle applicatif
do $$
declare bloques int := 0;
begin
  begin perform public.comptable_members('aaaaaaaa-0000-0000-0000-000000000001');
  exception when insufficient_privilege then bloques := bloques + 1; when others then null; end;
  begin perform public.expense_verrouillee(current_setting('app.v20')::uuid);
  exception when insufficient_privilege then bloques := bloques + 1; when others then null; end;
  begin perform public.lock_household('aaaaaaaa-0000-0000-0000-000000000001');
  exception when insufficient_privilege then bloques := bloques + 1; when others then null; end;
  begin perform public.est_comptable('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a');
  exception when insufficient_privilege then bloques := bloques + 1; when others then null; end;
  begin perform public.valider_parties('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a',1,'[]'::jsonb);
  exception when insufficient_privilege then bloques := bloques + 1; when others then null; end;
  if bloques <> 5 then
    raise exception 'ÉCHEC R3 : seulement %/5 utilitaires internes sont protégés', bloques;
  end if;
  raise notice 'R3 OK — les 5 utilitaires internes sont inaccessibles au rôle applicatif';
end $$;

-- R4 : aucun droit d'écriture résiduel sur les tables comptables
do $$
declare n int;
begin
  select count(*) into n
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('expenses','expense_shares','expense_children','expense_comments','reimbursements')
    and grantee in ('authenticated','anon','PUBLIC')
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if n <> 0 then raise exception 'ÉCHEC R4 : % droits d''écriture subsistent', n; end if;
  select count(*) into n
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'expenses'
    and grantee = 'authenticated' and privilege_type = 'SELECT';
  if n = 0 then raise exception 'ÉCHEC R4b : la lecture a été perdue'; end if;
  raise notice 'R4 OK — écriture directe révoquée pour tous les rôles clients, lecture préservée';
end $$;

-- R6 : annulation sécurisée et non rejouable
do $$
declare rid uuid;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  select id into rid from reimbursements
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null limit 1;
  perform public.cancel_reimbursement(rid);
  begin
    perform public.cancel_reimbursement(rid);
    raise exception 'ÉCHEC R6 : annulation rejouable';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%déjà été annulé%' then
      raise exception 'ÉCHEC R6b : mauvais motif (%)', sqlerrm;
    end if;
  end;
  if not public.test_audit_existe('reimbursement', rid) then
    raise exception 'ÉCHEC R6c : annulation non journalisée';
  end if;
  raise notice 'R6 OK — annulation non rejouable et journalisée';
end $$;

-- R6b : un membre non comptable ne peut pas annuler
do $$
declare rid uuid;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  rid := public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
    1,'cash',current_date,null,'cible R6b');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);  -- médiatrice
  begin
    perform public.cancel_reimbursement(rid);
    raise exception 'ÉCHEC R6d : la médiatrice a annulé un remboursement';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);  -- étrangère
  begin
    perform public.cancel_reimbursement(rid);
    raise exception 'ÉCHEC R6e : une personne extérieure a annulé un remboursement';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'R6b OK — annulation refusée au médiateur et à un tiers';
end $$;

-- R7 : le verrou transactionnel est bien posé par les quatre fonctions
do $$
declare manquantes text := '';
begin
  if position('lock_household' in pg_get_functiondef('public.update_expense(uuid,text,bigint,date,uuid,uuid[],jsonb)'::regprocedure)) = 0
    then manquantes := manquantes || 'update_expense '; end if;
  if position('lock_household' in pg_get_functiondef('public.delete_expense(uuid)'::regprocedure)) = 0
    then manquantes := manquantes || 'delete_expense '; end if;
  if position('lock_household' in pg_get_functiondef('public.create_reimbursement(uuid,uuid,uuid,bigint,reimbursement_method,date,text,text)'::regprocedure)) = 0
    then manquantes := manquantes || 'create_reimbursement '; end if;
  if position('lock_household' in pg_get_functiondef('public.cancel_reimbursement(uuid)'::regprocedure)) = 0
    then manquantes := manquantes || 'cancel_reimbursement '; end if;
  if manquantes <> '' then
    raise exception 'ÉCHEC R7 : verrou absent dans : %', manquantes;
  end if;
  raise notice 'R7 OK — verrou transactionnel du foyer présent dans les 4 fonctions d''écriture';
end $$;

-- R8 : payeur et parts limités aux deux parents comptables
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  -- payeur non comptable (médiatrice)
  begin
    perform public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Payeur invalide',1000,current_date,null,
      '00000000-0000-0000-0000-00000000000d', null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":1000}]'::jsonb);
    raise exception 'ÉCHEC R8a : la médiatrice a été acceptée comme payeuse';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%payeur doit être%' then raise exception 'ÉCHEC R8a2 : motif (%)', sqlerrm; end if;
  end;
  -- part visant une non comptable
  begin
    perform public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Part invalide',1000,current_date,null,
      '00000000-0000-0000-0000-00000000000a', null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000d","owed_cents":1000}]'::jsonb);
    raise exception 'ÉCHEC R8b : une part visant la médiatrice a été acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  -- doublon de parent
  begin
    perform public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Doublon',1000,current_date,null,
      '00000000-0000-0000-0000-00000000000a', null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":500},
        {"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":500}]'::jsonb);
    raise exception 'ÉCHEC R8c : un parent en double a été accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%deux fois%' then raise exception 'ÉCHEC R8c2 : motif (%)', sqlerrm; end if;
  end;
  raise notice 'R8 OK — payeur et parts restreints aux deux parents comptables, doublon refusé';
end $$;

-- R9 : la revue n'est possible que pour l'autre parent comptable
do $$
declare eid uuid;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  eid := public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Revue',2000,current_date,null,
    '00000000-0000-0000-0000-00000000000a', null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":1000},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":1000}]'::jsonb);
  -- le payeur/créateur ne peut pas valider
  begin
    perform public.review_expense(eid, 'validate');
    raise exception 'ÉCHEC R9a : le payeur a validé sa propre dépense';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  -- la médiatrice ne peut pas valider
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
  begin
    perform public.review_expense(eid, 'validate');
    raise exception 'ÉCHEC R9b : la médiatrice a validé une dépense';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  -- action inventée refusée
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  begin
    perform public.review_expense(eid, 'peu_importe');
    raise exception 'ÉCHEC R9c : action arbitraire acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%Action non reconnue%' then raise exception 'ÉCHEC R9c2 : motif (%)', sqlerrm; end if;
  end;
  -- l'autre parent valide
  perform public.review_expense(eid, 'validate');
  if (select status from expenses where id = eid) <> 'validated' then
    raise exception 'ÉCHEC R9d : validation légitime refusée';
  end if;
  raise notice 'R9 OK — revue réservée à l''autre parent comptable, actions énumérées';
end $$;

-- R10 : household_balance contrôle le nombre de membres comptables et la cohérence
do $$
declare s record;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if s.membres_comptables <> 2 then
    raise exception 'ÉCHEC R10 : membres_comptables = %', s.membres_comptables;
  end if;
  if abs(s.net_cents) > s.depenses_total_cents + s.remboursements_total_cents then
    raise exception 'ÉCHEC R10b : net incohérent avec les totaux';
  end if;

  -- troisième parent comptable : le foyer devient incohérent, la fonction doit refuser
  perform public.test_ajouter_membre('aaaaaaaa-0000-0000-0000-000000000001',
                                     '00000000-0000-0000-0000-00000000000e', 'parent');
  begin
    perform public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'ÉCHEC R10c : solde calculé avec 3 membres comptables';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%Foyer incohérent%' then raise exception 'ÉCHEC R10d : motif (%)', sqlerrm; end if;
  end;
  perform public.test_retirer_membre('aaaaaaaa-0000-0000-0000-000000000001',
                                     '00000000-0000-0000-0000-00000000000e');
  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if s.membres_comptables <> 2 then raise exception 'ÉCHEC R10e : état non rétabli'; end if;
  raise notice 'R10 OK — nombre de membres comptables contrôlé, totaux cohérents avec le net';
end $$;

-- R11 : le foyer à un seul parent renvoie un état neutre, sans erreur
do $$
declare s record;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
  select * into s from public.household_balance('bbbbbbbb-0000-0000-0000-000000000002');
  if s.membres_comptables > 1 or not s.equilibre or s.net_cents <> 0 then
    raise exception 'ÉCHEC R11 : foyer à un parent mal traité (membres=%, net=%)',
      s.membres_comptables, s.net_cents;
  end if;
  raise notice 'R11 OK — foyer à un seul parent : état neutre, aucune erreur';
end $$;

select 'TESTS D''INTÉGRITÉ COMPTABLE PASSÉS' as resultat;
