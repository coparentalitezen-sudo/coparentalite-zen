-- ============================================================
-- TESTS — suppression de compte (S1 à S6)
--
-- Le point délicat n'est pas d'effacer : c'est de n'effacer que ce qui est
-- personnel, en laissant intact le planning dont l'autre parent est
-- copropriétaire.
-- ============================================================
\set ON_ERROR_STOP on

-- Les comptes naissent d'une inscription, dans les fixtures : les insérer ici
-- se heurterait — à juste titre — aux droits refusés au rôle applicatif.
-- Le foyer, lui, est bâti par les fonctions de l'application elle-même.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);

do $$
declare partage uuid; solitaire uuid; enf uuid;
begin
  partage := public.create_household('Foyer partagé');
  perform set_config('app.partage', partage::text, false);
  insert into children (household_id, first_name, created_by)
  values (partage, 'Enfant', auth.uid()) returning id into enf;
  perform set_config('app.enfant', enf::text, false);

  insert into user_settings (profile_id) values ('00000000-0000-0000-0000-0000000000d1')
  on conflict (profile_id) do nothing;

  -- Second foyer, dont le partant est le seul habitant.
  solitaire := public.create_household('Foyer solitaire');
  perform set_config('app.solitaire', solitaire::text, false);

  -- Le parent restant rejoint le foyer partagé par le chemin ordinaire :
  -- une invitation, puis son acceptation. Une insertion directe se heurterait
  -- aux règles de sécurité, et c'est précisément ce qu'elles doivent faire.
  insert into invitations (household_id, email, token, status, created_by)
  values (partage, 'restant@essai.local',
          '11111111-2222-3333-4444-555555555555', 'pending', auth.uid());
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', false);
select public.accept_invitation('11111111-2222-3333-4444-555555555555');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);

-- ============ S0 : le foyer partagé compte bien deux parents ============
do $$
declare n int;
begin
  select count(*) into n from household_members
   where household_id = current_setting('app.partage')::uuid and deleted_at is null;
  raise notice 'S0 — % membres dans le foyer partagé', n;
  if n <> 2 then raise exception 'ÉCHEC S0 : % membres au lieu de 2', n; end if;
end $$;

-- ============ S1 : la suppression s'exécute et rend son compte ============
do $$
declare bilan jsonb;
begin
  bilan := public.delete_my_account();
  if (bilan->>'foyers_quittes')::int < 2 then
    raise exception 'ÉCHEC S1 : % foyers quittés au lieu de 2', bilan->>'foyers_quittes';
  end if;
  raise notice 'S1 OK — % foyers quittés, % fermés',
    bilan->>'foyers_quittes', bilan->>'foyers_fermes';
end $$;

-- ============ S2 : le profil ne porte plus rien de nominatif ============
do $$
declare p record;
begin
  select * into p from profiles where id = '00000000-0000-0000-0000-0000000000d1';
  if p.display_name <> 'Compte supprimé' then
    raise exception 'ÉCHEC S2 : le nom subsiste (%)', p.display_name;
  end if;
  if p.email = 'part@essai.local' then
    raise exception 'ÉCHEC S2b : l''adresse subsiste';
  end if;
  if p.deleted_at is null then
    raise exception 'ÉCHEC S2c : le profil n''est pas marqué supprimé';
  end if;
  raise notice 'S2 OK — profil anonymisé, adresse libérée';
end $$;

-- ============ S3 : le planning de l'autre parent est intact ============
-- La vérification passe par un contrôleur hors-RLS : une fois parti, le foyer
-- devient invisible au partant, et l'absence de ligne ne prouve rien.
do $$
begin
  if public.test_household_deleted(current_setting('app.partage')::uuid) then
    raise exception 'ÉCHEC S3 : le foyer partagé a été fermé';
  end if;
  raise notice 'S3 OK — le foyer partagé demeure pour l''autre parent';
end $$;

-- ============ S4 : le foyer sans habitant est fermé ============
do $$
begin
  if not public.test_household_deleted(current_setting('app.solitaire')::uuid) then
    raise exception 'ÉCHEC S4 : un foyer sans habitant reste ouvert';
  end if;
  raise notice 'S4 OK — le foyer solitaire est fermé';
end $$;

-- ============ S5 : les réglages personnels sont effacés ============
do $$
begin
  if exists (select 1 from user_settings where profile_id = '00000000-0000-0000-0000-0000000000d1') then
    raise exception 'ÉCHEC S5 : les réglages personnels subsistent';
  end if;
  if exists (select 1 from push_subscriptions where profile_id = '00000000-0000-0000-0000-0000000000d1') then
    raise exception 'ÉCHEC S5b : un appareil reste inscrit';
  end if;
  raise notice 'S5 OK — réglages et appareils effacés';
end $$;

-- ============ S6 : l'effacement laisse une trace ============
do $$
begin
  if not public.test_effacement_trace('00000000-0000-0000-0000-0000000000d1') then
    raise exception 'ÉCHEC S6 : aucune trace de l''effacement';
  end if;
  raise notice 'S6 OK — effacement tracé';
end $$;

-- Sans session, la fonction doit refuser.
select set_config('request.jwt.claim.sub', '', false);
do $$
declare bloque boolean := false;
begin
  begin
    perform public.delete_my_account();
  exception when others then bloque := true;
  end;
  if not bloque then
    raise exception 'ÉCHEC S7 : suppression acceptée sans authentification';
  end if;
  raise notice 'S7 OK — refus sans session';
end $$;

select 'TESTS DE SUPPRESSION DE COMPTE PASSÉS' as resultat;
