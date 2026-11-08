-- ============================================================
-- Catégorie « quiz » des contenus marketing
--
-- Le générateur produit chaque semaine un carrousel de catégorie « quiz »
-- (renvoi vers /quiz), mais la contrainte posée en 00041 ne connaissait pas
-- cette catégorie : l'enregistrement échouait chaque semaine depuis le
-- 22/08/2026 (« violates check constraint marketing_contenus_categorie_check »,
-- 10 occurrences dans les journaux Vercel), et le contenu disparaissait sans
-- bruit du calendrier et du flux Pinterest.
-- ============================================================

alter table public.marketing_contenus drop constraint if exists marketing_contenus_categorie_check;
alter table public.marketing_contenus add constraint marketing_contenus_categorie_check
  check (categorie in ('conseil','quotidien','demonstration','modele','marque','quiz'));
