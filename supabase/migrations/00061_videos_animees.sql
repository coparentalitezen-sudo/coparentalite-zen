-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00061 : vidéos animées publiées automatiquement
--
-- Les vidéos sont rendues hors Vercel (GitHub Actions, dossier video-gabarit/),
-- contrôlées, puis déposées dans un espace de stockage PRIVÉ. La publication
-- (Vercel) ne part que si tous les contrôles bloquants sont verts.
--
--   1. marketing_videos      : une ligne par vidéo à rendre (Short du jour, Reel du générateur),
--                              son scénario, son statut de rendu et le résultat de chaque contrôle ;
--   2. marketing_parametres  : heure de publication réglable par plateforme, compteur d'échecs
--                              consécutifs (suspension automatique), ligne « tiktok » bloquée ;
--   3. marketing_publications: statut « a_verifier » (publication interrompue dont l'issue est inconnue :
--                              jamais republiée automatiquement) ;
--   4. marketing_alertes     : notifications à envoyer (échecs, suspensions, récapitulatif), écrites par
--                              le rendu comme par la publication, envoyées par Vercel qui détient les clés ;
--   5. stockage              : espace « videos » privé ; l'espace « reels » cesse d'être public.
--
-- Tables fermées à tout compte connecté (RLS sans politique) : seule la clé de service y accède.
-- Aucune donnée de foyer, d'enfant, de paiement ou de planning n'est lue ni modifiée.
--
-- Retour arrière :
--   drop table if exists public.marketing_videos; drop table if exists public.marketing_alertes;
--   alter table public.marketing_parametres drop column if exists heure, drop column if exists echecs_consecutifs;
--   delete from public.marketing_parametres where plateforme = 'tiktok';
--   (contraintes : remettre les listes de la migration 00060 ; stockage : update storage.buckets set public = true where id = 'reels')
--
-- Rejouable : « if not exists », « on conflict » et contraintes recréées.
-- ============================================================

begin;

-- ---------- 1. Vidéos ----------
create table if not exists public.marketing_videos (
  id              uuid primary key default gen_random_uuid(),
  -- « yt-AAAA-MM-JJ » pour le Short du jour, référence du contenu pour un Reel
  cle             text not null unique,
  source          text not null check (source in ('youtube', 'reel')),
  -- Jour de publication prévu (heure de Paris)
  jour            date not null,
  reference       text not null,
  scenario        jsonb not null,
  -- Empreinte du scénario et du gabarit : si l'un change, la vidéo est rendue de nouveau
  empreinte       text not null,
  statut          text not null default 'a_rendre'
                  check (statut in ('a_rendre', 'en_cours', 'prete', 'echec')),
  -- Résultat de chaque contrôle bloquant : { ok, controles: [{ nom, ok, mesure, detail }] }
  controles       jsonb,
  chemin_video    text,
  chemin_affiche  text,
  chemin_srt      text,
  duree           numeric(6, 2),
  taille_octets   bigint,
  erreur          text,
  tentatives      int not null default 0,
  verrou_jusqua   timestamptz,
  rendue_le       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Une vidéo « prête » a forcément passé tous ses contrôles : la base le garantit, pas seulement le code.
  constraint marketing_videos_prete_controlee check (
    statut <> 'prete' or (controles is not null and (controles ->> 'ok')::boolean is true and chemin_video is not null)
  )
);
create index if not exists marketing_videos_jour on public.marketing_videos (jour, source);
alter table public.marketing_videos enable row level security;

-- ---------- 2. Réglages ----------
alter table public.marketing_parametres
  add column if not exists heure smallint not null default 10 check (heure between 0 and 23),
  add column if not exists echecs_consecutifs smallint not null default 0;

alter table public.marketing_parametres drop constraint if exists marketing_parametres_plateforme_connue;
alter table public.marketing_parametres add constraint marketing_parametres_plateforme_connue
  check (plateforme in ('global', 'instagram', 'facebook', 'pinterest', 'youtube', 'tiktok'));

-- TikTok : aucune voie officielle ne permet une publication sans geste humain à chaque vidéo.
-- La ligne existe pour que l'admin affiche le canal et son motif ; elle reste éteinte.
insert into public.marketing_parametres (plateforme, mode, actif, suspendu_motif)
values ('tiktok', 'automatique', false,
  'Bloqué : TikTok exige à chaque publication un geste de l’utilisateur (aperçu, choix de confidentialité, consentement). Aucune solution officielle n’autorise une publication entièrement automatique.')
on conflict (plateforme) do nothing;

-- ---------- 3. Publications : issue inconnue après interruption ----------
alter table public.marketing_publications drop constraint if exists marketing_publications_statut_check;
alter table public.marketing_publications add constraint marketing_publications_statut_check
  check (statut in ('en_attente', 'envoyee', 'publiee', 'echec', 'abandonnee', 'a_verifier'));

-- ---------- 4. Alertes ----------
create table if not exists public.marketing_alertes (
  id          uuid primary key default gen_random_uuid(),
  -- Une alerte par clé : la même panne signalée dix fois n'envoie qu'un message
  cle         text not null unique,
  niveau      text not null check (niveau in ('echec', 'suspension', 'recapitulatif', 'information')),
  sujet       text not null,
  message     text not null,
  envoyee_le  timestamptz,
  erreur_envoi text,
  created_at  timestamptz not null default now()
);
create index if not exists marketing_alertes_a_envoyer on public.marketing_alertes (created_at) where envoyee_le is null;
alter table public.marketing_alertes enable row level security;

-- ---------- Droits (leçon de la migration 00057 : la clé de service doit être nommée) ----------
grant select, insert, update, delete on public.marketing_videos, public.marketing_alertes to service_role;
revoke all on public.marketing_videos, public.marketing_alertes from anon, authenticated;

-- ---------- 5. Stockage privé ----------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('videos', 'videos', false)
      on conflict (id) do update set public = false;
    update storage.buckets set public = false where id = 'reels';
  end if;
end $$;

commit;
