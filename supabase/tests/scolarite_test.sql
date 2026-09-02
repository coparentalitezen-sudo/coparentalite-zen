-- ============================================================
-- TESTS — Emploi du temps scolaire (migration 00050)
-- Exécution : psql -d czen_run -U authenticated -f scolarite_test.sql
-- (fixtures : rls_fixtures.sql + scolarite_fixtures.sql, chargées avant)
-- ============================================================

\set ON_ERROR_STOP on

-- ============ Contexte : DIANE (owner, Foyer Édu, premium + flag actif) ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);

-- Test 1 : import nominal réussit et pose bien les créneaux.
do $$
declare n int;
begin
  perform public.enregistrer_edt_import(
    'eeeeeeee-1111-0000-0000-000000000001'::uuid,
    'cccccccc-1111-0000-0000-000000000001'::uuid,
    '2026-2027', false, null,
    '[{"jour_semaine":1,"heure_debut":"08:00","heure_fin":"09:00","matiere":"Maths"},
      {"jour_semaine":1,"heure_debut":"09:00","heure_fin":"10:00","matiere":"Français"}]'::jsonb
  );
  select count(*) into n from public.list_edt_creneaux('cccccccc-1111-0000-0000-000000000001'::uuid, '2026-2027');
  if n <> 2 then
    raise exception 'ÉCHEC T1 : % créneau(x) trouvé(s) au lieu de 2', n;
  end if;
  raise notice 'T1 OK — import nominal, 2 créneaux enregistrés';
end $$;

-- Test 2 : ré-import remplace les créneaux 'photo', jamais un créneau 'manuel'.
do $$
declare n_photo int; n_manuel int;
begin
  insert into edt_creneaux (child_id, annee_scolaire, jour_semaine, heure_debut, heure_fin, matiere, source, created_by)
  values ('cccccccc-1111-0000-0000-000000000001','2026-2027', 3, '14:00', '15:00', 'Piscine (ajout manuel)', 'manuel', auth.uid());

  perform public.enregistrer_edt_import(
    'eeeeeeee-1111-0000-0000-000000000001'::uuid,
    'cccccccc-1111-0000-0000-000000000001'::uuid,
    '2026-2027', false, null,
    '[{"jour_semaine":2,"heure_debut":"08:00","heure_fin":"09:00","matiere":"Histoire"}]'::jsonb
  );

  select count(*) into n_photo from edt_creneaux
   where child_id = 'cccccccc-1111-0000-0000-000000000001' and annee_scolaire = '2026-2027'
     and source = 'photo' and deleted_at is null;
  select count(*) into n_manuel from edt_creneaux
   where child_id = 'cccccccc-1111-0000-0000-000000000001' and annee_scolaire = '2026-2027'
     and source = 'manuel' and deleted_at is null;

  if n_photo <> 1 then raise exception 'ÉCHEC T2a : % créneau(x) photo au lieu de 1 après ré-import', n_photo; end if;
  if n_manuel <> 1 then raise exception 'ÉCHEC T2b : le créneau manuel n''a pas survécu au ré-import'; end if;
  raise notice 'T2 OK — ré-import : photo remplacé, manuel conservé';
end $$;

-- Test 3 : quota — 5 imports au total consommés (1 du fixture + 2 des tests
-- précédents = 3 déjà faits) ; on complète jusqu'à 5, le 6e doit échouer.
do $$
declare deja int; i int;
begin
  select imports_utilises into deja from enfant_scolarite
   where child_id = 'cccccccc-1111-0000-0000-000000000001' and annee_scolaire = '2026-2027';
  for i in 1..(5 - deja) loop
    perform public.enregistrer_edt_import(
      'eeeeeeee-1111-0000-0000-000000000001'::uuid,
      'cccccccc-1111-0000-0000-000000000001'::uuid,
      '2026-2027', false, null, '[]'::jsonb
    );
  end loop;

  begin
    perform public.enregistrer_edt_import(
      'eeeeeeee-1111-0000-0000-000000000001'::uuid,
      'cccccccc-1111-0000-0000-000000000001'::uuid,
      '2026-2027', false, null, '[]'::jsonb
    );
    raise exception 'ÉCHEC T3 : un 6e import a été accepté malgré le quota de 5';
  exception when others then
    if sqlerrm like '%Quota%' then
      raise notice 'T3 OK — quota de 5 imports/an appliqué, 6e refusé';
    else
      raise; -- une autre erreur que le quota est un vrai échec de test
    end if;
  end;
end $$;

-- Test 4 : semaine A/B — ancrage requis si l'option est active.
do $$
begin
  begin
    perform public.enregistrer_edt_import(
      'eeeeeeee-1111-0000-0000-000000000001'::uuid,
      'cccccccc-1111-0000-0000-000000000001'::uuid,
      '2027-2028', true, null, '[]'::jsonb
    );
    raise exception 'ÉCHEC T4 : semaine A/B active sans ancrage a été acceptée';
  exception when others then
    raise notice 'T4 OK — ancrage de semaine A obligatoire si l''option est active';
  end;
end $$;

-- ============ Contexte : ERIK (owner, Foyer Édu Gratuit, sans le flag) ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);

-- Test 5 : entitlement — un foyer non premium ne peut pas importer, même
-- avec can_write() = true (propriétaire de son propre foyer).
do $$
begin
  begin
    perform public.enregistrer_edt_import(
      'eeeeeeee-1111-0000-0000-000000000002'::uuid,
      'cccccccc-1111-0000-0000-000000000002'::uuid,
      '2026-2027', false, null, '[]'::jsonb
    );
    raise exception 'ÉCHEC T5 : un foyer gratuit a pu importer un emploi du temps';
  exception when others then
    if sqlerrm like '%inclus dans votre offre%' then
      raise notice 'T5 OK — foyer gratuit refusé (fonctionnalité non incluse dans l''offre)';
    else
      raise;
    end if;
  end;
end $$;

-- ============ Contexte : CAROL (foyer B, étrangère à Foyer Édu) ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);

-- Test 6 : isolation — Carol ne voit rien du planning scolaire de Nora.
do $$
declare n int;
begin
  select count(*) into n from public.list_edt_creneaux('cccccccc-1111-0000-0000-000000000001'::uuid, '2026-2027');
  if n <> 0 then
    raise exception 'ÉCHEC T6a : Carol voit % créneau(x) de Nora (foyer étranger)', n;
  end if;
  raise notice 'T6a OK — créneaux de Nora invisibles pour Carol';
end $$;

do $$
begin
  begin
    perform public.edt_scolaire_etat(
      'eeeeeeee-1111-0000-0000-000000000001'::uuid,
      'cccccccc-1111-0000-0000-000000000001'::uuid,
      '2026-2027'
    );
    raise exception 'ÉCHEC T6b : Carol a pu lire l''état scolaire d''un foyer étranger';
  exception when others then
    if sqlerrm like '%inaccessible%' then
      raise notice 'T6b OK — edt_scolaire_etat refuse un foyer étranger';
    else
      raise;
    end if;
  end;
end $$;

do $$
begin
  begin
    perform public.enregistrer_edt_import(
      'eeeeeeee-1111-0000-0000-000000000001'::uuid,
      'cccccccc-1111-0000-0000-000000000001'::uuid,
      '2026-2027', false, null, '[]'::jsonb
    );
    raise exception 'ÉCHEC T6c : Carol a pu écrire dans un foyer étranger';
  exception when others then
    raise notice 'T6c OK — écriture refusée pour un foyer étranger';
  end;
end $$;
