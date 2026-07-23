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

-- ============ T50 : invitation sans adresse rattachée ============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f4', false);
do $$
begin
  begin
    perform public.accept_invitation('77777777-7777-7777-7777-777777777775'); -- email null
    raise exception 'ÉCHEC T50 : un lien sans destinataire a été accepté';
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlerrm not like '%aucune adresse%' then raise exception 'ÉCHEC T50b : mauvais motif (%)', sqlerrm; end if;
  end;
  raise notice 'T50 OK — invitation sans adresse rattachée refusée';
end $$;

select 'TOUS LES TESTS DE SÉCURITÉ D''INVITATION SONT PASSÉS' as resultat;
