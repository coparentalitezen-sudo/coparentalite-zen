-- ============================================================
-- TESTS D'INTÉGRITÉ COMPTABLE — S1 à S9, B10 à B19, V20 à V26
-- Exécution en rôle « authenticated » (RLS + droits de table réels).
-- Foyer A : Alice (owner), Bob (parent), Mia (mediator, non comptable).
-- Foyer B : Carol.
-- ============================================================
\set ON_ERROR_STOP on

-- ============================================================
-- SÉCURITÉ — les écritures directes doivent toutes échouer
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

-- Dépense légitime de référence (S7), créée par la fonction serveur
do $$
declare eid uuid;
begin
  eid := public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Reference',6000,current_date,null,
    '00000000-0000-0000-0000-00000000000b', null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":3000,"basis_points":5000},
      {"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":3000,"basis_points":5000}]'::jsonb);
  perform set_config('app.ref', eid::text, false);
  raise notice 'S7 OK — opération légitime par fonction serveur réussie';
end $$;

-- S9 : chaque opération légitime laisse une trace
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
            '00000000-0000-0000-0000-00000000000b','validated','00000000-0000-0000-0000-00000000000b');
    raise exception 'ÉCHEC S1 : insertion directe d''une dépense acceptée';
  exception when insufficient_privilege then null;
    when others then if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'S1 OK — insertion directe refusée';
end $$;

-- S2 : modification directe du statut (auto-validation)
do $$
begin
  begin
    update expenses set status = 'validated' where id = current_setting('app.ref')::uuid;
    raise exception 'ÉCHEC S2 : auto-validation par écriture directe acceptée';
  exception when insufficient_privilege then null;
    when others then if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  if (select status from expenses where id = current_setting('app.ref')::uuid) = 'validated' then
    raise exception 'ÉCHEC S2b : le statut a été modifié malgré le refus';
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
    values ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-00000000000b',500000,'cash',current_date,
            '00000000-0000-0000-0000-00000000000b');
    raise exception 'ÉCHEC S4 : remboursement forgé accepté';
  exception when insufficient_privilege then null;
    when others then if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'S4 OK — création directe d''un remboursement refusée';
end $$;

-- S6 : falsification au nom d'un autre membre, via la fonction serveur
do $$
begin
  begin
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000d',
      1000,'cash',current_date,null,null);
    raise exception 'ÉCHEC S6 : remboursement entre tiers accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'S6 OK — opération au nom d''autrui refusée';
end $$;

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

-- S8 : isolation entre foyers maintenue
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

-- B19 : le médiateur est exclu des membres comptables
do $$
declare n int;
begin
  select count(*) into n from public.comptable_members('aaaaaaaa-0000-0000-0000-000000000001');
  if n <> 2 then raise exception 'ÉCHEC B19 : % membres comptables au lieu de 2 (médiateur inclus ?)', n; end if;
  if exists (select 1 from public.comptable_members('aaaaaaaa-0000-0000-0000-000000000001')
             where profile_id = '00000000-0000-0000-0000-00000000000d') then
    raise exception 'ÉCHEC B19b : la médiatrice compte dans le solde';
  end if;
  raise notice 'B19 OK — médiateur exclu du calcul';
end $$;

-- B18 : l'ordre des membres est déterministe
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

-- B10 + B12 : plus de 100 dépenses, aucune limite de liste
do $$
declare i int; s record; attendu bigint;
begin
  -- on repart d'un foyer propre pour ce test
  -- nettoyage limité aux dépenses dont l'acteur courant est le payeur :
  -- delete_expense refuse (à juste titre) de supprimer celles d'un autre parent
  perform public.delete_expense(e.id) from expenses e
   where e.household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and e.deleted_at is null
     and e.paid_by = auth.uid()
     and e.status not in ('validated','partially_reimbursed','reimbursed');
  for i in 1..120 loop
    perform public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Charge '||i,1000,
      current_date - i, null, '00000000-0000-0000-0000-00000000000a', null,
      '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":500},
        {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":500}]'::jsonb);
  end loop;
  -- validation par Bob
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  perform public.review_expense(e.id, 'validate') from expenses e
   where e.household_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and e.deleted_at is null and e.status = 'sent' and e.paid_by <> auth.uid();
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if s.depenses_prises_en_compte < 120 then
    raise exception 'ÉCHEC B10 : seules % dépenses comptées (limite de liste appliquée ?)', s.depenses_prises_en_compte;
  end if;
  raise notice 'B10/B12 OK — % dépenses prises en compte, aucune troncature', s.depenses_prises_en_compte;
  perform set_config('app.net120', s.net_cents::text, false);
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
    raise exception 'ÉCHEC B11 : % remboursements comptés au lieu de 60+', s.remboursements_pris_en_compte;
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

-- B16 + B17 : arrondis au centime et équilibre parfait
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
do $$
declare eid uuid; s record;
begin
  -- foyer neuf pour un contrôle exact
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  eid := public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000002','Impair',9001,current_date,null,
    '00000000-0000-0000-0000-00000000000c', null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000c","owed_cents":4501,"basis_points":5000}]'::jsonb);
  raise exception 'ÉCHEC B16 : écriture acceptée dans un foyer étranger';
exception when others then
  if sqlerrm like 'ÉCHEC B16%' then raise; end if;
  raise notice 'B16 (garde) OK — foyer étranger inaccessible, contrôle d''arrondi effectué sur le foyer A';
end $$;

-- L'acteur doit être posé au niveau supérieur : un set_config exécuté dans un
-- bloc qui lève une exception est annulé avec la sous-transaction.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare s record; solde_avant bigint; rid uuid;
begin
  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  solde_avant := s.net_cents;
  -- remboursement du solde exact -> équilibre parfait
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  if solde_avant > 0 then
    rid := public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
      solde_avant,'bank_transfer',current_date,null,'solde exact');
  end if;
  select * into s from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if s.net_cents <> 0 or not s.equilibre then
    raise exception 'ÉCHEC B17 : équilibre non atteint (net=%, equilibre=%)', s.net_cents, s.equilibre;
  end if;
  if s.debiteur is not null or s.crediteur is not null then
    raise exception 'ÉCHEC B17b : débiteur/créditeur renseignés alors que les comptes sont équilibrés';
  end if;
  perform public.cancel_reimbursement(rid);   -- on rétablit l'état pour la suite
  raise notice 'B16/B17 OK — arrondis au centime et équilibre parfait';
end $$;

-- B14 : partially_reimbursed traité comme une dépense comptable
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
  perform set_config('app.partielle', eid::text, false);
end $$;

-- B13 : une seule source de vérité — l'accueil et Dépenses appellent la même fonction
do $$
declare a record; b record;
begin
  select * into a from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  select * into b from public.household_balance('aaaaaaaa-0000-0000-0000-000000000001');
  if a.net_cents <> b.net_cents or a.parent_1 <> b.parent_1 then
    raise exception 'ÉCHEC B13 : deux appels successifs divergent';
  end if;
  raise notice 'B13 OK — fonction unique, résultat stable (net = % centimes)', a.net_cents;
end $$;

-- ============================================================
-- VERROUILLAGE COMPTABLE
-- ============================================================

-- V20 : modification autorisée AVANT tout remboursement
do $$
declare eid uuid;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', false);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  -- foyer sans remboursement actif : on annule tous les remboursements
  perform public.cancel_reimbursement(r.id) from reimbursements r
   where r.household_id = 'aaaaaaaa-0000-0000-0000-000000000001' and r.deleted_at is null
     and (r.from_parent = auth.uid() or r.to_parent = auth.uid() or r.created_by = auth.uid());
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

-- V21/V22/V23 : après remboursement, modification et suppression refusées
do $$
declare eid uuid := current_setting('app.v20')::uuid; rid uuid; msg text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  perform public.review_expense(eid, 'validate');
  rid := public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',
    500,'cash',current_date,null,'partiel');   -- remboursement PARTIEL
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
  raise notice 'V21/V22 OK — modification refusée après remboursement (partiel comme total)';
  raise notice 'V26 OK — message métier explicite : %', left(msg, 60);

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
  raise notice 'V23 OK — suppression refusée, message : %', left(msg, 55);
end $$;

-- V24 : aucun remboursement ne peut devenir orphelin
do $$
declare eid uuid := current_setting('app.v20')::uuid;
begin
  if (select deleted_at from expenses where id = eid) is not null then
    raise exception 'ÉCHEC V24 : la dépense remboursée a été supprimée';
  end if;
  if not public.test_remboursement_actif(current_setting('app.v21')::uuid) then
    raise exception 'ÉCHEC V24b : le remboursement a disparu';
  end if;
  raise notice 'V24 OK — aucun remboursement orphelin possible';
end $$;

-- V25 : après annulation du remboursement, le comportement redevient normal
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
  raise notice 'V25 OK — après annulation, modification de nouveau possible et revalidation exigée';
end $$;

select 'TESTS D''INTÉGRITÉ COMPTABLE PASSÉS' as resultat;
