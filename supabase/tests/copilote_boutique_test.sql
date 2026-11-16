-- ============================================================
-- TESTS — copilote business : boutiques, propositions, rapports (B1 à B5)
-- ============================================================
\set ON_ERROR_STOP on

-- ============ B1 : fermé aux comptes connectés ============
do $$
declare t text;
begin
  foreach t in array array[
    'boutique_imports','boutique_ventes','boutique_produits','boutique_vues',
    'copilote_propositions','copilote_rapports'
  ] loop
    begin
      execute format('select * from public.%I', t);
      raise exception 'ÉCHEC B1 : % lisible par le rôle applicatif', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'B1 OK — tables du copilote fermées aux comptes connectés';
end $$;

-- ============ B2 : fermé aux visiteurs, ouvert au service ============
do $$
declare t text;
begin
  foreach t in array array[
    'boutique_imports','boutique_ventes','boutique_produits','boutique_vues',
    'copilote_propositions','copilote_rapports'
  ] loop
    if has_table_privilege('anon', format('public.%I', t), 'select') then
      raise exception 'ÉCHEC B2 : % lisible par un visiteur', t;
    end if;
    if not has_table_privilege('service_role', format('public.%I', t), 'insert')
       or not has_table_privilege('service_role', format('public.%I', t), 'update')
       or not has_table_privilege('service_role', format('public.%I', t), 'delete') then
      raise exception 'ÉCHEC B2 : service_role privé d''écriture sur %', t;
    end if;
  end loop;
  raise notice 'B2 OK — visiteurs exclus, service_role autorisé';
end $$;

set role service_role;

-- ============ B3 : réimporter ne double pas une vente ============
do $$
begin
  insert into public.boutique_ventes
    (plateforme, commande, ligne, produit_ref, titre, montant_centimes, vendu_le)
  values ('etsy', '1001', 'a', 'L1', 'Budget familial', 790, '2026-11-10');
  insert into public.boutique_ventes
    (plateforme, commande, ligne, produit_ref, titre, montant_centimes, vendu_le)
  values ('etsy', '1001', 'a', 'L1', 'Budget familial', 790, '2026-11-10')
  on conflict (plateforme, commande, ligne) do nothing;
  if (select count(*) from public.boutique_ventes where commande = '1001') <> 1 then
    raise exception 'ÉCHEC B3 : la vente a été doublée';
  end if;
  raise notice 'B3 OK — une vente réimportée n''est pas doublée';
end $$;

-- ============ B4 : valeurs bornées ============
do $$
begin
  begin
    insert into public.boutique_ventes
      (plateforme, commande, produit_ref, titre, montant_centimes, vendu_le)
    values ('amazon', '1', 'x', 'x', 100, '2026-11-10');
    raise exception 'ÉCHEC B4a : plateforme inconnue acceptée';
  exception when check_violation then null;
  end;
  begin
    insert into public.boutique_ventes
      (plateforme, commande, produit_ref, titre, montant_centimes, vendu_le)
    values ('etsy', '2', 'x', 'x', -1, '2026-11-10');
    raise exception 'ÉCHEC B4b : montant négatif accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.copilote_propositions (semaine, type, cle, titre, contenu, statut)
    values ('2026-S47', 'idee', 'k', 't', '{}', 'publiee');
    raise exception 'ÉCHEC B4c : statut inconnu accepté';
  exception when check_violation then null;
  end;
  raise notice 'B4 OK — plateformes, montants et statuts bornés';
end $$;

-- ============ B5 : une proposition par clé et par semaine ============
do $$
begin
  insert into public.copilote_propositions (semaine, type, cle, titre, contenu)
  values ('2026-S47', 'idee', 'pack:a+b', 'Pack', '{}');
  begin
    insert into public.copilote_propositions (semaine, type, cle, titre, contenu)
    values ('2026-S47', 'idee', 'pack:a+b', 'Pack bis', '{}');
    raise exception 'ÉCHEC B5 : proposition doublée dans la même semaine';
  exception when unique_violation then null;
  end;
  insert into public.copilote_propositions (semaine, type, cle, titre, contenu)
  values ('2026-S48', 'idee', 'pack:a+b', 'Pack', '{}');
  raise notice 'B5 OK — une proposition par clé et par semaine';
end $$;

reset role;
