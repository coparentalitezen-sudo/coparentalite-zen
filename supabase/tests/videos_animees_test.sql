-- ============================================================
-- TESTS — Vidéos animées publiées automatiquement (V1 à V6)
--
-- La publication n'a plus de validation humaine : c'est la base qui garantit
-- qu'une vidéo « prête » a passé tous ses contrôles, que TikTok reste bloqué,
-- et que ces tables restent fermées à tout compte connecté.
-- ============================================================
\set ON_ERROR_STOP on

-- ============ V1 : tables fermées au rôle applicatif et aux visiteurs ============
do $$
begin
  begin
    perform * from public.marketing_videos;
    raise exception 'ÉCHEC V1 : vidéos lisibles par le rôle applicatif';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.marketing_alertes;
    raise exception 'ÉCHEC V1b : alertes lisibles par le rôle applicatif';
  exception when insufficient_privilege then null;
  end;
  if has_table_privilege('anon', 'public.marketing_videos', 'select')
     or has_table_privilege('anon', 'public.marketing_alertes', 'select') then
    raise exception 'ÉCHEC V1c : lisible par anon';
  end if;
  raise notice 'V1 OK — vidéos et alertes fermées aux comptes connectés et aux visiteurs';
end $$;

set role service_role;

-- ============ V2 : « prête » exige des contrôles tous verts et un fichier ============
do $$
begin
  begin
    insert into public.marketing_videos (cle, source, jour, reference, scenario, empreinte, statut, controles, chemin_video)
    values ('v2-a', 'youtube', current_date, 'v2-a', '{}', 'e', 'prete', '{"ok": false, "controles": []}', 'x.mp4');
    raise exception 'ÉCHEC V2 : vidéo prête avec contrôles en échec acceptée';
  exception when check_violation then null;
  end;
  begin
    insert into public.marketing_videos (cle, source, jour, reference, scenario, empreinte, statut, controles)
    values ('v2-b', 'youtube', current_date, 'v2-b', '{}', 'e', 'prete', '{"ok": true, "controles": []}');
    raise exception 'ÉCHEC V2b : vidéo prête sans fichier acceptée';
  exception when check_violation then null;
  end;
  begin
    insert into public.marketing_videos (cle, source, jour, reference, scenario, empreinte, statut)
    values ('v2-c', 'youtube', current_date, 'v2-c', '{}', 'e', 'prete');
    raise exception 'ÉCHEC V2c : vidéo prête sans contrôles acceptée';
  exception when check_violation then null;
  end;
  insert into public.marketing_videos (cle, source, jour, reference, scenario, empreinte, statut, controles, chemin_video)
  values ('v2-ok', 'youtube', current_date, 'v2-ok', '{}', 'e', 'prete', '{"ok": true, "controles": [{"nom": "voix", "ok": true}]}', 'x.mp4');
  raise notice 'V2 OK — une vidéo « prête » a forcément passé ses contrôles';
end $$;

-- ============ V3 : une seule ligne par vidéo ============
do $$
begin
  begin
    insert into public.marketing_videos (cle, source, jour, reference, scenario, empreinte)
    values ('v2-ok', 'youtube', current_date, 'v2-ok', '{}', 'e');
    raise exception 'ÉCHEC V3 : doublon de vidéo accepté';
  exception when unique_violation then null;
  end;
  raise notice 'V3 OK — une clé, une vidéo';
end $$;

-- ============ V4 : TikTok présent, éteint, avec un motif lisible ============
do $$
declare r record;
begin
  select actif, suspendu_motif into r from public.marketing_parametres where plateforme = 'tiktok';
  if r is null then raise exception 'ÉCHEC V4 : ligne TikTok absente'; end if;
  if r.actif then raise exception 'ÉCHEC V4b : TikTok actif'; end if;
  if coalesce(r.suspendu_motif, '') = '' then raise exception 'ÉCHEC V4c : motif TikTok vide'; end if;
  raise notice 'V4 OK — TikTok bloqué, motif affiché';
end $$;

-- ============ V5 : heure de publication bornée ============
do $$
begin
  begin
    update public.marketing_parametres set heure = 24 where plateforme = 'instagram';
    raise exception 'ÉCHEC V5 : heure 24 acceptée';
  exception when check_violation then null;
  end;
  raise notice 'V5 OK — heure entre 0 et 23';
end $$;

-- ============ V6 : alerte unique par clé (pas de rafale pour une même panne) ============
do $$
begin
  insert into public.marketing_alertes (cle, niveau, sujet, message) values ('v6', 'echec', 's', 'm');
  insert into public.marketing_alertes (cle, niveau, sujet, message) values ('v6', 'echec', 's', 'm')
    on conflict (cle) do nothing;
  if (select count(*) from public.marketing_alertes where cle = 'v6') <> 1 then
    raise exception 'ÉCHEC V6 : alerte dupliquée';
  end if;
  raise notice 'V6 OK — une panne, une alerte';
end $$;

delete from public.marketing_videos where cle like 'v2-%';
delete from public.marketing_alertes where cle = 'v6';
reset role;
