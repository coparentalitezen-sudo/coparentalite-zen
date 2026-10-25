-- ============================================================
-- TESTS — YouTube Shorts (Y1 à Y5)
--
-- Les jetons et l'historique des Shorts ne doivent être lisibles par aucun
-- compte connecté, et la base doit refuser un second Short pour le même jour,
-- quelle que soit la façon dont la tâche est déclenchée.
-- ============================================================
\set ON_ERROR_STOP on

-- ============ Y1 : tables fermées au rôle applicatif ============
do $$
begin
  begin
    perform * from public.marketing_youtube_connexion;
    raise exception 'ÉCHEC Y1 : connexion lisible par le rôle applicatif';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.marketing_youtube_shorts;
    raise exception 'ÉCHEC Y1b : Shorts lisibles par le rôle applicatif';
  exception when insufficient_privilege then null;
  end;
  raise notice 'Y1 OK — jetons et historique fermés aux comptes connectés';
end $$;

-- ============ Y2 : fermées aux visiteurs ============
do $$
begin
  if has_table_privilege('anon', 'public.marketing_youtube_connexion', 'select')
     or has_table_privilege('anon', 'public.marketing_youtube_shorts', 'select') then
    raise exception 'ÉCHEC Y2 : lisible par anon';
  end if;
  raise notice 'Y2 OK — fermées aux visiteurs anonymes';
end $$;

set role service_role;

-- ============ Y3 : un seul Short par jour ============
do $$
begin
  insert into public.marketing_youtube_shorts
    (jour, cle_idempotence, sujet, accroche, titre, description, visibilite_demandee)
  values ('2026-10-26', 'short-2026-10-26', 'garde-alternee', 'a', 't', 'd', 'public');
  begin
    insert into public.marketing_youtube_shorts
      (jour, cle_idempotence, sujet, accroche, titre, description, visibilite_demandee)
    values ('2026-10-26', 'short-2026-10-26-bis', 'garde-alternee', 'a', 't', 'd', 'public');
    raise exception 'ÉCHEC Y3 : deux Shorts le même jour';
  exception when unique_violation then null;
  end;
  raise notice 'Y3 OK — un seul Short du jour par date';
end $$;

-- ============ Y4 : les essais ne prennent pas la place du Short du jour ============
do $$
begin
  insert into public.marketing_youtube_shorts
    (jour, essai, cle_idempotence, sujet, accroche, titre, description, visibilite_demandee)
  values ('2026-10-26', true, 'essai-1', 'garde-alternee', 'a', 't', 'd', 'private'),
         ('2026-10-26', true, 'essai-2', 'garde-alternee', 'a', 't', 'd', 'private');
  raise notice 'Y4 OK — essais possibles le même jour, sans toucher au Short du jour';
end $$;

-- ============ Y5 : réservation exclusive ============
do $$
declare n int;
begin
  -- Deux exécutions lisent tentatives = 0 ; la première réserve…
  update public.marketing_youtube_shorts set statut = 'en_cours', tentatives = 1
   where cle_idempotence = 'short-2026-10-26' and tentatives = 0;
  -- …la seconde, avec la même version lue, n'obtient rien.
  update public.marketing_youtube_shorts set statut = 'en_cours', tentatives = 1
   where cle_idempotence = 'short-2026-10-26' and tentatives = 0;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC Y5 : réservation obtenue deux fois'; end if;
  raise notice 'Y5 OK — une seule exécution obtient la réservation';
end $$;

reset role;

-- ============ Y6 : canal YouTube éteint au départ ============
do $$
declare actif boolean;
begin
  set local role service_role;
  select p.actif into actif from public.marketing_parametres p where p.plateforme = 'youtube';
  if actif is distinct from false then raise exception 'ÉCHEC Y6 : canal YouTube allumé ou absent (%)', actif; end if;
  raise notice 'Y6 OK — le canal YouTube démarre éteint';
end $$;

select 'TESTS YOUTUBE PASSÉS' as resultat;
