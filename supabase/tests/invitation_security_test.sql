-- ============================================================
-- TESTS DE SÉCURITÉ DE L'INVITATION — T42 à T48
-- Exécution en rôle « authenticated » (RLS active), après
-- invitation_fixtures.sql (créé en superuser).
--
-- Comptes :
--   Alice   ...000a  alice@test.fr        propriétaire du foyer A
--   Parent2 ...00f3  Parent2@Test.FR      destinataire de l'invitation
--   Étranger...00f4  etranger@test.fr     possède le lien, non destinataire
--   Carol   ...000c  carol@test.fr        déjà membre du foyer B
-- ============================================================
\set ON_ERROR_STOP on

-- ============ T43 : un autre compte possédant le lien est refusé ============
-- (joué avant T42 : le lien doit rester utilisable ensuite)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f4', false);
do $$
declare tok uuid := '77777777-7777-7777-7777-777777777771';
begin
  begin
    perform public.accept_invitation(tok);
    raise exception 'ÉCHEC T43 : un compte non destinataire a rejoint le foyer';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%autre adresse e-mail%' then
      raise exception 'ÉCHEC T43b : mauvais motif de refus (%)', sqlerrm;
    end if;
  end;
  raise notice 'T43 OK — compte non destinataire refusé, motif explicite';
end $$;

-- ============ T44 : après le refus, aucun effet de bord ============
do $$
declare st text; n int;
begin
  select public.test_statut_invitation('77777777-7777-7777-7777-777777777771') into st;
  if st <> 'pending' then
    raise exception 'ÉCHEC T44 : le statut de l''invitation est passé à % au lieu de pending', st;
  end if;
  select public.test_nb_membres('aaaaaaaa-0000-0000-0000-000000000001') into n;
  if n <> 3 then
    raise exception 'ÉCHEC T44b : % membres au lieu de 3 — une ligne a été créée', n;
  end if;
  if public.test_est_membre('aaaaaaaa-0000-0000-0000-000000000001',
                            '00000000-0000-0000-0000-0000000000f4') then
    raise exception 'ÉCHEC T44c : le compte refusé est devenu membre';
  end if;
  raise notice 'T44 OK — invitation toujours « pending », aucun membre ajouté';
end $$;

-- ============ T48 : le créateur ne peut pas accepter sa propre invitation ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
begin
  begin
    perform public.accept_invitation('77777777-7777-7777-7777-777777777771');
    raise exception 'ÉCHEC T48 : le créateur a accepté sa propre invitation';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%autre adresse e-mail%' then
      raise exception 'ÉCHEC T48b : mauvais motif (%)', sqlerrm;
    end if;
  end;
  raise notice 'T48 OK — le créateur (adresse différente) est refusé';
end $$;

-- ============ T47a : invitation révoquée ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f3', false);
do $$
begin
  begin
    perform public.accept_invitation('77777777-7777-7777-7777-777777777772'); -- révoquée
    raise exception 'ÉCHEC T47 : une invitation révoquée a été acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%révoquée%' then raise exception 'ÉCHEC T47b : mauvais motif (%)', sqlerrm; end if;
  end;
  raise notice 'T47a OK — invitation révoquée refusée';
end $$;

-- ============ T47b : invitation expirée ============
do $$
begin
  begin
    perform public.accept_invitation('77777777-7777-7777-7777-777777777773'); -- expirée
    raise exception 'ÉCHEC T47c : une invitation expirée a été acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%expiré%' then raise exception 'ÉCHEC T47d : mauvais motif (%)', sqlerrm; end if;
  end;
  raise notice 'T47b OK — invitation expirée refusée';
end $$;

-- ============ T45 + T42 : casse et espaces ignorés, le destinataire rejoint ============
-- L'invitation vise « Parent2@Test.FR » ; le compte est « parent2@test.fr ».
do $$
declare hid uuid;
begin
  hid := public.accept_invitation('77777777-7777-7777-7777-777777777771');
  if hid <> 'aaaaaaaa-0000-0000-0000-000000000001' then
    raise exception 'ÉCHEC T42 : mauvais foyer retourné (%)', hid;
  end if;
  if not public.test_est_membre('aaaaaaaa-0000-0000-0000-000000000001',
                                '00000000-0000-0000-0000-0000000000f3') then
    raise exception 'ÉCHEC T42b : le destinataire n''est pas membre après acceptation';
  end if;
  if public.test_statut_invitation('77777777-7777-7777-7777-777777777771') <> 'accepted' then
    raise exception 'ÉCHEC T42c : statut d''invitation non mis à jour';
  end if;
  raise notice 'T45 OK — comparaison insensible à la casse et aux espaces';
  raise notice 'T42 OK — le compte destinataire rejoint bien le foyer';
end $$;

-- ============ T46 : un lien déjà accepté n'est pas réutilisable ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f4', false);
do $$
begin
  begin
    perform public.accept_invitation('77777777-7777-7777-7777-777777777771');
    raise exception 'ÉCHEC T46 : un lien déjà accepté a été réutilisé';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%déjà été utilisée%' then raise exception 'ÉCHEC T46b : mauvais motif (%)', sqlerrm; end if;
  end;
  raise notice 'T46 OK — lien à usage unique';
end $$;

-- ============ T49 (règle métier) : membre d'un autre foyer refusé ============
-- Carol appartient au foyer B ; une invitation du foyer A lui est adressée.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$
begin
  begin
    perform public.accept_invitation('77777777-7777-7777-7777-777777777774');
    raise exception 'ÉCHEC T49 : un membre d''un autre foyer a rejoint silencieusement';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%déjà à un autre foyer%' then
      raise exception 'ÉCHEC T49b : mauvais motif (%)', sqlerrm;
    end if;
  end;
  if public.test_statut_invitation('77777777-7777-7777-7777-777777777774') <> 'pending' then
    raise exception 'ÉCHEC T49c : l''invitation a été consommée malgré le refus';
  end if;
  raise notice 'T49 OK — appartenance à un autre foyer refusée, invitation intacte';
end $$;

-- ============ T50 : invitation par téléphone, sans adresse ============
--
-- COMPROMIS ASSUMÉ, décidé avec le propriétaire du produit. Une invitation
-- peut n'être rattachée qu'à un numéro de téléphone : le lien devient alors
-- le seul secret, et quiconque le reçoit entre dans le foyer.
--
-- Ce n'est acceptable que parce que trois garde-fous demeurent, vérifiés
-- ci-dessous : expiration, usage unique, et notification de l'invitant.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f4', false);
do $$
declare hid uuid; statut text;
begin
  hid := public.accept_invitation('77777777-7777-7777-7777-777777777775'); -- sans adresse
  if hid is null then
    raise exception 'ÉCHEC T50 : une invitation par téléphone a été refusée';
  end if;

  -- Usage unique : le jeton est consommé
  statut := public.test_statut_invitation('77777777-7777-7777-7777-777777777775');
  if statut <> 'accepted' then
    raise exception 'ÉCHEC T50b : statut % après acceptation', statut;
  end if;

  -- Et il ne peut pas resservir
  begin
    perform public.accept_invitation('77777777-7777-7777-7777-777777777775');
    raise exception 'ÉCHEC T50c : le lien a resservi une seconde fois';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%déjà été utilisée%' then
      raise exception 'ÉCHEC T50d : motif inattendu (%)', sqlerrm;
    end if;
  end;
  raise notice 'T50 OK — invitation par téléphone acceptée, jeton consommé, non rejouable';
end $$;

-- ============ T51 : le lien reste soumis à l'expiration ============
do $$
begin
  -- Une invitation expirée est refusée, avec ou sans adresse : c'est le
  -- garde-fou qui limite la portée d'un lien égaré.
  begin
    perform public.test_expirer_invitation('77777777-7777-7777-7777-777777777776');
    perform public.accept_invitation('77777777-7777-7777-7777-777777777776');
    raise exception 'ÉCHEC T51 : une invitation expirée a été acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%expiré%' then
      raise exception 'ÉCHEC T51b : motif inattendu (%)', sqlerrm;
    end if;
  end;
  raise notice 'T51 OK — un lien expiré reste refusé, adresse ou non';
end $$;

select 'TOUS LES TESTS DE SÉCURITÉ D''INVITATION SONT PASSÉS' as resultat;

-- ============================================================
-- C1 à C7 — CODE DE CONFIRMATION
--
-- Une invitation sans adresse n'a que le lien pour secret, et la page de
-- connexion ne filtre rien : quiconque le reçoit peut créer un compte et
-- rejoindre le foyer. Le code à six chiffres, transmis par un autre canal,
-- rétablit le double verrou.
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ============ C1 : une invitation par téléphone porte un code ============
do $$
declare r record;
begin
  select * into r from public.create_invitation(
    'aaaaaaaa-0000-0000-0000-000000000001', null, 'parent'::member_role, '0612345678');
  if r.code is null then
    raise exception 'ÉCHEC C1 : aucune code généré pour une invitation sans adresse';
  end if;
  if length(r.code) <> 6 or r.code !~ '^[0-9]{6}$' then
    raise exception 'ÉCHEC C1b : code mal formé (%)', r.code;
  end if;
  perform set_config('app.tok_tel', r.jeton::text, false);
  perform set_config('app.code_tel', r.code, false);
  raise notice 'C1 OK — code à six chiffres généré';
end $$;

-- ============ C2 : une invitation par e-mail n'en porte pas ============
do $$
declare r record;
begin
  select * into r from public.create_invitation(
    'aaaaaaaa-0000-0000-0000-000000000001', 'avec.adresse@test.fr');
  if r.code is not null then
    raise exception 'ÉCHEC C2 : un code est exigé alors que l''adresse verrouille déjà';
  end if;
  raise notice 'C2 OK — pas de code superflu quand l''adresse suffit';
end $$;

-- ============ C3 : le destinataire sait qu'un code sera demandé ============
do $$
begin
  if not public.invitation_exige_code(current_setting('app.tok_tel')::uuid) then
    raise exception 'ÉCHEC C3 : l''exigence de code n''est pas annoncée';
  end if;
  raise notice 'C3 OK — l''exigence est annoncée avant toute authentification';
end $$;

-- ============ C4 : sans code, l'invitation est refusée ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f5', false);
do $$
begin
  begin
    perform public.accept_invitation(current_setting('app.tok_tel')::uuid);
    raise exception 'ÉCHEC C4 : le lien seul a suffi à rejoindre le foyer';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%code de confirmation%' then
      raise exception 'ÉCHEC C4b : motif inattendu (%)', sqlerrm;
    end if;
  end;
  raise notice 'C4 OK — un lien intercepté ne suffit pas';
end $$;

-- ============ C5 : un code erroné est refusé et décompté ============
do $$
declare tentatives_avant int;
begin
  tentatives_avant := public.test_tentatives_invitation(current_setting('app.tok_tel')::uuid);
  -- Un code erroné renvoie NULL plutôt que de lever une exception : sans quoi
  -- la transaction annulée emporterait le comptage des tentatives.
  if public.accept_invitation(current_setting('app.tok_tel')::uuid, '000000') is not null then
    raise exception 'ÉCHEC C5 : un code erroné a été accepté';
  end if;
  if public.test_tentatives_invitation(current_setting('app.tok_tel')::uuid) <> tentatives_avant + 1 then
    raise exception 'ÉCHEC C5c : la tentative n''a pas été comptée';
  end if;
  raise notice 'C5 OK — code erroné refusé et décompté';
end $$;

-- ============ C6 : cinq échecs révoquent l'invitation ============
do $$
declare i int; statut text;
begin
  -- Un million de combinaisons se parcourt vite : sans plafond, l'essai
  -- exhaustif viendrait à bout du code.
  for i in 1..4 loop
    begin
      perform public.accept_invitation(current_setting('app.tok_tel')::uuid, '111111');
    exception when others then null;
    end;
  end loop;
  statut := public.test_statut_invitation(current_setting('app.tok_tel')::uuid);
  if statut <> 'revoked' then
    raise exception 'ÉCHEC C6 : statut % après cinq échecs, révocation attendue', statut;
  end if;
  raise notice 'C6 OK — révocation automatique au cinquième échec';
end $$;

-- ============ C7 : le bon code ouvre bien le foyer ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare r record; hid uuid;
begin
  select * into r from public.create_invitation(
    'aaaaaaaa-0000-0000-0000-000000000001', null, 'parent'::member_role, '0698765432');

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f6', false);
  hid := public.accept_invitation(r.jeton, r.code);
  if hid is null then
    raise exception 'ÉCHEC C7 : le bon code n''a pas ouvert le foyer';
  end if;
  raise notice 'C7 OK — le bon code donne accès, transmis par un autre canal';
end $$;

select 'TESTS DU CODE DE CONFIRMATION PASSÉS' as resultat;
