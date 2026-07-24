-- ============================================================
-- TESTS DES REMBOURSEMENTS — T70 à T75
-- Foyer A : Alice (owner), Bob (parent), Mia (médiatrice lecture seule).
-- ============================================================
\set ON_ERROR_STOP on

-- Mise en situation : un remboursement n'est désormais possible que s'il
-- correspond à une dette réelle. Alice avance 200,00 € partagés 50/50,
-- Bob valide : Bob doit donc 100,00 € à Alice.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare eid uuid;
begin
  eid := public.create_expense_full('aaaaaaaa-0000-0000-0000-000000000001','Avance socle',20000,current_date,null,
    '00000000-0000-0000-0000-00000000000a', null,
    '[{"parent_id":"00000000-0000-0000-0000-00000000000a","owed_cents":10000,"basis_points":5000},
      {"parent_id":"00000000-0000-0000-0000-00000000000b","owed_cents":10000,"basis_points":5000}]'::jsonb);
  perform set_config('app.socle', eid::text, false);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin perform public.review_expense(current_setting('app.socle')::uuid, 'validate'); end $$;

-- ============ T70 : Bob rembourse Alice ============
do $$
declare rid uuid; montant bigint;
begin
  rid := public.create_reimbursement(
    'aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000b',   -- de Bob
    '00000000-0000-0000-0000-00000000000a',   -- vers Alice
    4275, 'bank_transfer', current_date, 'VIR-2026-07', 'Part cantine');
  select amount_cents into montant from reimbursements where id = rid;
  if montant <> 4275 then raise exception 'ÉCHEC T70 : montant enregistré %', montant; end if;
  -- vérifié hors-RLS : le rôle « parent » ne lit pas le journal d'audit, c'est voulu
  if not public.test_audit_existe('reimbursement', rid) then
    raise exception 'ÉCHEC T70b : aucune trace dans le journal d''audit';
  end if;
  raise notice 'T70 OK — remboursement enregistré avec référence et trace';
end $$;

-- ============ T71 : montant nul ou négatif refusé ============
do $$
declare m bigint;
begin
  foreach m in array array[0::bigint, -100::bigint] loop
    begin
      perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a',
        m, 'cash', current_date, null, null);
      raise exception 'ÉCHEC T71 : montant % accepté', m;
    exception when others then
      if sqlerrm like 'ÉCHEC%' then raise; end if;
    end;
  end loop;
  raise notice 'T71 OK — montants nul et négatif refusés';
end $$;

-- ============ T72 : parent extérieur au foyer refusé ============
do $$
begin
  begin
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', -- Carol, foyer B
      1000, 'cash', current_date, null, null);
    raise exception 'ÉCHEC T72 : remboursement vers un parent extérieur accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%parents comptables du foyer%' then
      raise exception 'ÉCHEC T72b : mauvais motif (%)', sqlerrm;
    end if;
  end;
  raise notice 'T72 OK — parent extérieur au foyer refusé';
end $$;

-- ============ T73 : émetteur = destinataire refusé ============
do $$
begin
  begin
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b',
      1000, 'cash', current_date, null, null);
    raise exception 'ÉCHEC T73 : remboursement à soi-même accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T73 OK — remboursement à soi-même refusé';
end $$;

-- ============ T74 : la médiatrice (lecture seule) ne peut pas ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$
begin
  begin
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a',
      1000, 'cash', current_date, null, null);
    raise exception 'ÉCHEC T74 : la médiatrice a enregistré un remboursement';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T74 OK — enregistrement refusé en lecture seule';
end $$;

-- ============ T75 : un membre non concerné ne peut pas enregistrer ============
-- Alice tente d'enregistrer un remboursement entre Bob et un tiers : elle est
-- écrivaine du foyer mais n'est ni émettrice ni destinataire.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
begin
  begin
    perform public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d',
      1000, 'cash', current_date, null, null);
    raise exception 'ÉCHEC T75 : un membre non concerné a enregistré un remboursement';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%effectue le paiement%' then
      raise exception 'ÉCHEC T75b : mauvais motif (%)', sqlerrm;
    end if;
  end;
  raise notice 'T75 OK — seul le parent qui paie peut enregistrer le remboursement';
end $$;

-- ============ T76 : isolation — le foyer B ne voit pas ce remboursement ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
begin
  if exists (select 1 from reimbursements
             where household_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'ÉCHEC T76 : le foyer B voit les remboursements du foyer A';
  end if;
  raise notice 'T76 OK — remboursements isolés par foyer';
end $$;

select 'TOUS LES TESTS DE REMBOURSEMENT SONT PASSÉS' as resultat;

-- ============ T77 : annulation par un parent concerné ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare rid uuid;
begin
  rid := public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a',
    500, 'cash', current_date, null, 'sens erroné');
  perform public.cancel_reimbursement(rid);
  if exists (select 1 from reimbursements where id = rid and deleted_at is null) then
    raise exception 'ÉCHEC T77 : le remboursement est toujours actif';
  end if;
  if not public.test_audit_existe('reimbursement', rid) then
    raise exception 'ÉCHEC T77b : annulation non tracée';
  end if;
  -- suppression logique : la ligne existe toujours
  if not public.test_remboursement_existe(rid) then
    raise exception 'ÉCHEC T77c : la ligne a été supprimée physiquement';
  end if;
  perform set_config('app.t77', rid::text, false);
  raise notice 'T77 OK — annulation logique, ligne conservée, trace en audit';
end $$;

-- ============ T78 : double annulation refusée ============
do $$
begin
  begin
    perform public.cancel_reimbursement(current_setting('app.t77')::uuid);
    raise exception 'ÉCHEC T78 : un remboursement déjà annulé a été annulé une 2e fois';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T78 OK — double annulation refusée';
end $$;

-- ============ T79 : un tiers connaissant l'identifiant ne peut pas annuler ============
-- Bob crée un remboursement et en transmet l'identifiant ; Carol (foyer B) tente
-- de l'annuler alors qu'elle ne peut même pas le lire.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare rid uuid;
begin
  rid := public.create_reimbursement('aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a',
    900, 'cash', current_date, null, 'cible du test T79');
  perform set_config('app.t79', rid::text, false);
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
declare rid uuid := current_setting('app.t79')::uuid;
begin
  begin
    perform public.cancel_reimbursement(rid);
    raise exception 'ÉCHEC T79 : un membre d''un autre foyer a annulé un remboursement';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  if not public.test_remboursement_actif(rid) then
    raise exception 'ÉCHEC T79b : le remboursement a été annulé malgré le refus';
  end if;
  raise notice 'T79 OK — annulation refusée à un tiers, même avec l''identifiant';
end $$;

select 'TESTS D''ANNULATION PASSÉS' as resultat2;
