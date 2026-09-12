-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00054 : seau des vidéos marketing
--
-- BESOIN
-- Les Reels (generateur.ts) sont aujourd'hui publiés comme une simple image.
-- video.ts en assemble désormais une vraie vidéo, rendue par GitHub Actions
-- (pas par Vercel, dont l'offre Hobby limite la durée d'exécution — voir
-- .github/workflows/video-marketing.yml). Le fichier produit doit vivre
-- quelque part que Meta puisse aller chercher par adresse signée, et jamais
-- dans Git : une vidéo par Reel publié pèserait vite plus lourd que le dépôt
-- entier.
--
-- SÉCURITÉ
-- Même politique que le seau des sauvegardes (migration 00039) : aucune
-- politique pour authenticated ni anon, l'absence de politique vaut
-- interdiction, seule la clé de service y accède — depuis le script de rendu
-- (écriture) et depuis publication.ts (lecture, pour signer l'adresse envoyée
-- à Meta).
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('marketing-videos', 'marketing-videos', false, 104857600)
on conflict (id) do update set public = false;

drop policy if exists "marketing_videos_lecture" on storage.objects;
drop policy if exists "marketing_videos_ecriture" on storage.objects;

do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'marketing-videos' and public = false
  ) then
    raise exception 'Le seau des vidéos marketing doit rester privé';
  end if;
  raise notice 'Seau des vidéos marketing prêt, et privé.';
end $$;

commit;
