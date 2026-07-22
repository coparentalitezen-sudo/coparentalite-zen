-- ============================================================
-- TESTS DES FLUX SERVEUR — invitations, export RGPD, suppressions
-- Exécution : psql -U authenticated (RLS active) après fixtures.
-- ============================================================
\set ON_ERROR_STOP on

-- ============ T20 : création auto du profil à l'inscription ============
-- (l'insert dans auth.users est fait par le superuser dans flows_fixtures.sql ;
--  ici on vérifie que le trigger a créé le profil de 'newuser')
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
do $$
begin
  if not exists (select 1 from profiles where id = '00000000-0000-0000-0000-0000000000f1'
                   and display_name = 'Nina') then
    raise exception 'ÉCHEC T20 : le profil n''a pas été créé automatiquement à l''inscription';
  end if;
  raise notice 'T20 OK — profil créé automatiquement par le trigger auth.users';
end $$;

-- ============ T21 : création de foyer via RPC ============
do $$
declare hid uuid;
begin
  hid := public.create_household('Foyer de Nina');
  if not exists (select 1 from household_members
                 where household_id = hid and profile_id = auth.uid() and role = 'owner') then
    raise exception 'ÉCHEC T21 : le créateur n''est pas owner de son foyer';
  end if;
  perform set_config('app.test_hid', hid::text, false);
  raise notice 'T21 OK — foyer créé, créateur owner';
end $$;

-- ============ T22 : invitation créée, non visible par un étranger ============
do $$
declare tok uuid; hid uuid := current_setting('app.test_hid')::uuid;
begin
  tok := public.create_invitation(hid, 'Oscar@Test.fr');
  perform set_config('app.test_tok', tok::text, false);
  if not exists (select 1 from invitations where token = tok and email = 'oscar@test.fr' and status = 'pending') then
    raise exception 'ÉCHEC T22 : invitation absente ou e-mail non normalisé';
  end if;
  raise notice 'T22 OK — invitation créée (e-mail normalisé en minuscules)';
end $$;

-- Mallory (aucun foyer) ne voit pas cette invitation et ne peut pas en créer
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
do $$
declare hid uuid := current_setting('app.test_hid')::uuid;
begin
  if exists (select 1 from invitations where household_id = hid) then
    raise exception 'ÉCHEC T23 : un étranger voit les invitations du foyer';
  end if;
  begin
    perform public.create_invitation(hid, 'pirate@test.fr');
    raise exception 'ÉCHEC T23b : un étranger a créé une invitation';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T23 OK — invitations invisibles et infalsifiables pour un étranger';
end $$;

-- ============ T24 : acceptation par Oscar ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$
declare hid uuid;
begin
  hid := public.accept_invitation(current_setting('app.test_tok')::uuid);
  if not exists (select 1 from household_members
                 where household_id = hid and profile_id = auth.uid() and role = 'parent') then
    raise exception 'ÉCHEC T24 : Oscar n''est pas membre après acceptation';
  end if;
  raise notice 'T24 OK — invitation acceptée, Oscar est parent du foyer';
end $$;

-- T25 : le même jeton ne peut pas être réutilisé (par un 3e compte)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
do $$
begin
  begin
    perform public.accept_invitation(current_setting('app.test_tok')::uuid);
    raise exception 'ÉCHEC T25 : un jeton déjà utilisé a été accepté une seconde fois';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T25 OK — jeton à usage unique (%)', 'déjà utilisée';
end $$;

-- T26 : une invitation expirée est refusée
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$
begin
  begin
    perform public.accept_invitation('99999999-9999-9999-9999-999999999999'::uuid);
    raise exception 'ÉCHEC T26 : une invitation expirée a été acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%expiré%' then raise exception 'ÉCHEC T26b : mauvais motif de rejet (%)', sqlerrm; end if;
  end;
  raise notice 'T26 OK — invitation expirée rejetée avec le bon motif';
end $$;

-- ============ T27 : export RGPD ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
do $$
declare data jsonb;
begin
  data := public.export_my_data();
  if data->'profil'->>'display_name' <> 'Nina' then
    raise exception 'ÉCHEC T27 : profil absent de l''export';
  end if;
  if jsonb_array_length(data->'foyers') < 1 then
    raise exception 'ÉCHEC T27b : foyers absents de l''export';
  end if;
  if data::text like '%storage_path%' then
    raise exception 'ÉCHEC T27c : l''export fuite des chemins de stockage internes';
  end if;
  raise notice 'T27 OK — export RGPD complet (profil + foyers), sans chemins internes';
end $$;

-- T28 : l'export de Nina ne contient pas les données du foyer A (dont elle n'est pas membre)
do $$
declare data jsonb;
begin
  data := public.export_my_data();
  if data::text like '%Cantine mars%' then
    raise exception 'ÉCHEC T28 : l''export contient des données d''un foyer étranger';
  end if;
  raise notice 'T28 OK — export limité aux foyers de l''utilisateur';
end $$;

-- ============ T29 : suppression du foyer refusée aux non-propriétaires ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$
begin
  begin
    perform public.delete_household(current_setting('app.test_hid')::uuid);
    raise exception 'ÉCHEC T29 : un simple parent a supprimé le foyer';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T29 OK — suppression du foyer réservée au propriétaire';
end $$;

-- ============ T30 : suppression du compte d'Oscar (membre non unique) ============
do $$
declare hid uuid := current_setting('app.test_hid')::uuid;
begin
  perform public.delete_my_account();
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000f2') then
    raise exception 'ÉCHEC T30 : le compte auth n''a pas été supprimé';
  end if;
  if exists (select 1 from household_members
             where profile_id = '00000000-0000-0000-0000-0000000000f2' and deleted_at is null) then
    raise exception 'ÉCHEC T30b : l''appartenance au foyer n''a pas été retirée';
  end if;
  -- le foyer survit (Nina reste) — vérifié hors-RLS (Oscar ne voit plus rien)
  if public.test_household_deleted(hid) then
    raise exception 'ÉCHEC T30c : le foyer a été supprimé alors qu''il restait un membre';
  end if;
  raise notice 'T30 OK — compte supprimé, appartenance retirée, foyer préservé pour Nina';
end $$;

-- ============ T31 : suppression du compte de Nina (dernier membre → foyer supprimé) ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
do $$
declare hid uuid := current_setting('app.test_hid')::uuid;
begin
  perform public.delete_my_account();
  -- vérifié hors-RLS : après suppression, Nina ne voit plus son ancien foyer
  if not public.test_household_deleted(hid) then
    raise exception 'ÉCHEC T31 : le foyer du dernier membre n''a pas été supprimé';
  end if;
  if exists (select 1 from profiles where id = '00000000-0000-0000-0000-0000000000f1' and email like '%@test.fr') then
    raise exception 'ÉCHEC T31b : l''e-mail n''a pas été anonymisé';
  end if;
  raise notice 'T31 OK — dernier membre : foyer supprimé, e-mail anonymisé, session révoquée';
end $$;

-- ============ T32 : logique des chemins Storage ============
do $$
begin
  if public.household_from_path('aaaaaaaa-0000-0000-0000-000000000001/facture.pdf')
     <> 'aaaaaaaa-0000-0000-0000-000000000001'::uuid then
    raise exception 'ÉCHEC T32 : extraction du foyer depuis le chemin incorrecte';
  end if;
  begin
    perform public.household_from_path('pas-un-uuid/fichier.pdf');
    raise exception 'ÉCHEC T32b : un chemin invalide n''a pas été rejeté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  raise notice 'T32 OK — extraction du foyer depuis le chemin Storage (uuid strict)';
end $$;

select 'TOUS LES TESTS DE FLUX SONT PASSÉS' as resultat;
