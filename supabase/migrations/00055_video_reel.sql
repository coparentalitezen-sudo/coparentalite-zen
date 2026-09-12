-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00055 : suivi de la vidéo d'un Reel
--
-- BESOIN
-- publication.ts doit savoir, pour un contenu de format 'reel', si une vidéo
-- a déjà été rendue et où la trouver dans le seau marketing-videos (migration
-- 00054) — sans quoi il publie l'ancien comportement, une image simple.
--
-- POURQUOI DEUX COLONNES SUR marketing_contenus ET NON UNE TABLE À PART
-- Même raisonnement que pin_id/pin_cree_le (migration 00051) : un contenu a
-- au plus une vidéo, la relation est 1-1.
--
-- video_chemin porte le CHEMIN dans le seau, jamais une adresse signée : une
-- signature Supabase expire, le chemin non.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

alter table marketing_contenus add column if not exists video_chemin text;
-- Horodatage du rendu, pas de la publication : utile pour distinguer une
-- vidéo jamais rendue d'une vidéo rendue mais pas encore publiée, en
-- diagnostic comme dans un journal.
alter table marketing_contenus add column if not exists video_rendue_le timestamptz;

create unique index if not exists idx_marketing_contenus_video_chemin
  on marketing_contenus (video_chemin) where video_chemin is not null;

commit;
