-- ============================================================
-- TESTS — copilote : publications produits (P1 à P5)
-- ============================================================
\set ON_ERROR_STOP on

-- ============ P1 : fermé aux comptes connectés et aux visiteurs ============
do $$
declare t text;
begin
  foreach t in array array['copilote_contenus','copilote_parametres'] loop
    begin
      execute format('select * from public.%I', t);
      raise exception 'ÉCHEC P1 : % lisible par le rôle applicatif', t;
    exception when insufficient_privilege then null;
    end;
    if has_table_privilege('anon', format('public.%I', t), 'select') then
      raise exception 'ÉCHEC P1 : % lisible par un visiteur', t;
    end if;
  end loop;
  raise notice 'P1 OK — publications produits fermées aux comptes et aux visiteurs';
end $$;

set role service_role;

-- ============ P2 : auto-validation désactivée au départ ============
do $$
begin
  if (select valeur from public.copilote_parametres where cle = 'auto_valider') <> 'false'::jsonb then
    raise exception 'ÉCHEC P2 : l''auto-validation n''est pas désactivée par défaut';
  end if;
  raise notice 'P2 OK — rien ne part sans validation par défaut';
end $$;

-- ============ P3 : liens https uniquement ============
do $$
begin
  begin
    insert into public.boutique_produits (plateforme, reference, titre, url)
    values ('etsy', 'p3', 'Produit', 'javascript:alert(1)');
    raise exception 'ÉCHEC P3 : lien non https accepté';
  exception when check_violation then null;
  end;
  insert into public.boutique_produits (plateforme, reference, titre, url)
  values ('etsy', 'p3', 'Produit', 'https://www.etsy.com/fr/listing/1/produit');
  raise notice 'P3 OK — seuls les liens https sont acceptés';
end $$;

-- ============ P4 : référence bornée, statut borné, pas de doublon ============
do $$
declare p uuid;
begin
  select id into p from public.boutique_produits where reference = 'p3';
  insert into public.copilote_contenus (reference, produit_id, semaine, angle, accroche, appel_visuel,
    legende_instagram, legende_facebook, texte_alternatif, titre_pinterest, description_pinterest, date_publication)
  values ('p-2026s47-1', p, '2026-S47', 'probleme', 'A', 'B', 'IG', 'FB', 'Alt', 'T', 'D', '2026-11-17');
  begin
    insert into public.copilote_contenus (reference, produit_id, semaine, angle, accroche, appel_visuel,
      legende_instagram, legende_facebook, texte_alternatif, titre_pinterest, description_pinterest, date_publication)
    values ('P 1/../x', p, '2026-S47', 'probleme', 'A', 'B', 'IG', 'FB', 'Alt', 'T', 'D', '2026-11-17');
    raise exception 'ÉCHEC P4a : référence hors format acceptée';
  exception when check_violation then null;
  end;
  begin
    update public.copilote_contenus set statut = 'publie' where reference = 'p-2026s47-1';
    raise exception 'ÉCHEC P4b : statut inconnu accepté';
  exception when check_violation then null;
  end;
  insert into public.copilote_contenus (reference, produit_id, semaine, angle, accroche, appel_visuel,
    legende_instagram, legende_facebook, texte_alternatif, titre_pinterest, description_pinterest, date_publication)
  values ('p-2026s47-1', p, '2026-S47', 'probleme', 'Autre', 'B', 'IG', 'FB', 'Alt', 'T', 'D', '2026-11-17')
  on conflict (reference) do nothing;
  if (select accroche from public.copilote_contenus where reference = 'p-2026s47-1') <> 'A' then
    raise exception 'ÉCHEC P4c : une publication enregistrée a été réécrite';
  end if;
  raise notice 'P4 OK — références et statuts bornés, aucune réécriture';
end $$;

-- ============ P5 : la réserve accepte une légende Facebook, facultative ============
do $$
declare r uuid;
begin
  insert into public.marketing_reserve (theme, image_url, legende, legende_facebook, texte_alternatif)
  values ('boutique', 'https://exemple.test/v.jpg', 'IG', 'FB https://x', 'Alt') returning id into r;
  insert into public.marketing_reserve (theme, image_url, legende, texte_alternatif)
  values ('autre', 'https://exemple.test/v2.jpg', 'IG', 'Alt');
  update public.copilote_contenus set statut = 'programme', reserve_id = r where reference = 'p-2026s47-1';
  delete from public.marketing_reserve where id = r;
  if (select reserve_id from public.copilote_contenus where reference = 'p-2026s47-1') is not null then
    raise exception 'ÉCHEC P5 : lien vers une ligne de réserve supprimée conservé';
  end if;
  raise notice 'P5 OK — légende Facebook facultative, réserve supprimable';
end $$;

reset role;
