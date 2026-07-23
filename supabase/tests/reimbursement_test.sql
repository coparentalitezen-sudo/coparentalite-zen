-- ============================================================
-- TESTS DES REMBOURSEMENTS — T70 à T75
-- Foyer A : Alice (owner), Bob (parent), Mia (médiatrice lecture seule).
-- ============================================================
\set ON_ERROR_STOP on

-- ============ T70 : Bob rembourse Alice ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
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
    if sqlerrm not like '%membres du foyer%' then
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
    if sqlerrm not like '%vous concerne%' then
      raise exception 'ÉCHEC T75b : mauvais motif (%)', sqlerrm;
    end if;
  end;
  raise notice 'T75 OK — seuls les parents concernés peuvent enregistrer';
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
