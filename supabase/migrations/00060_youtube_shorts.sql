-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00060 : publication des YouTube Shorts
--
-- Deux tables, fermées à tout compte connecté — seul le serveur, par la clé
-- de service, y accède — et une ligne de réglages pour le canal YouTube,
-- éteinte au départ : rien ne part tant qu'elle n'est pas allumée sciemment.
--
-- Aucune donnée de foyer, d'enfant, de paiement ou de planning n'est lue ni
-- modifiée ici.
--
-- Retour arrière :
--   drop table if exists public.marketing_youtube_shorts;
--   drop table if exists public.marketing_youtube_connexion;
--   delete from public.marketing_parametres where plateforme = 'youtube';
--   alter table public.marketing_parametres drop constraint marketing_parametres_plateforme_connue;
--   alter table public.marketing_parametres add constraint marketing_parametres_plateforme_connue
--     check (plateforme in ('global', 'instagram', 'facebook', 'pinterest'));
--
-- Rejouable : « if not exists » et « on conflict do nothing » partout.
-- ============================================================

begin;

-- ---------- 1. Connexion à la chaîne ----------
-- Une seule ligne : une seule chaîne. Les jetons y sont CHIFFRÉS par
-- l'application (AES-256-GCM, clé dans les variables de Vercel) avant d'y
-- entrer : une lecture de la base, même par la clé de service, ne livre
-- jamais un jeton utilisable.
create table if not exists public.marketing_youtube_connexion (
  id                    boolean primary key default true check (id),
  etat                  text not null default 'deconnectee'
                        check (etat in ('deconnectee', 'active', 'revoquee')),
  chaine_id             text,
  chaine_titre          text,
  jeton_rafraichissement text,          -- chiffré
  jeton_acces           text,           -- chiffré
  jeton_acces_expire    timestamptz,
  scopes                text,
  -- Visibilité donnée aux Shorts publiés par la tâche quotidienne.
  visibilite            text not null default 'private'
                        check (visibilite in ('private', 'unlisted', 'public')),
  connecte_le           timestamptz,
  derniere_erreur       text,
  updated_at            timestamptz not null default now()
);

insert into public.marketing_youtube_connexion (id) values (true) on conflict (id) do nothing;

-- ---------- 2. Shorts publiés ----------
create table if not exists public.marketing_youtube_shorts (
  id                  uuid primary key default gen_random_uuid(),
  jour                date not null,
  -- Une publication d'essai, déclenchée depuis l'administration, ne prend
  -- pas la place du Short du jour.
  essai               boolean not null default false,
  cle_idempotence     text not null unique,
  sujet               text not null,
  accroche            text not null,
  titre               text not null,
  description         text not null,
  visibilite_demandee text not null check (visibilite_demandee in ('private', 'unlisted', 'public')),
  statut              text not null default 'en_attente'
                      check (statut in ('en_attente', 'en_cours', 'publiee', 'echec', 'a_verifier')),
  -- Adresse de la session d'envoi YouTube. Conservée AVANT l'envoi : si la
  -- connexion se coupe pendant le transfert, c'est elle qui permet de savoir
  -- si la vidéo est arrivée, au lieu de la renvoyer une seconde fois.
  session_envoi       text,
  taille_octets       bigint,
  video_id            text unique,
  chaine_id           text,
  visibilite_obtenue  text,
  tentatives          int not null default 0,
  verrou_jusqua       timestamptz,
  erreur_code         text,
  erreur_message      text,
  publie_le           timestamptz,
  verifie_le          timestamptz,
  vues                bigint,
  vues_relevees_le    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Un seul Short « du jour » par date : la garantie d'unicité tient en base,
-- quelle que soit la façon dont la tâche est déclenchée.
create unique index if not exists marketing_youtube_shorts_un_par_jour
  on public.marketing_youtube_shorts (jour) where not essai;

create index if not exists marketing_youtube_shorts_recents
  on public.marketing_youtube_shorts (created_at desc);

drop trigger if exists marketing_youtube_shorts_updated_at on public.marketing_youtube_shorts;
create trigger marketing_youtube_shorts_updated_at
  before update on public.marketing_youtube_shorts
  for each row execute function public.set_updated_at();

drop trigger if exists marketing_youtube_connexion_updated_at on public.marketing_youtube_connexion;
create trigger marketing_youtube_connexion_updated_at
  before update on public.marketing_youtube_connexion
  for each row execute function public.set_updated_at();

-- ---------- 3. Accès : serveur seulement ----------
alter table public.marketing_youtube_connexion enable row level security;
alter table public.marketing_youtube_shorts enable row level security;
revoke all on table public.marketing_youtube_connexion from public, anon, authenticated;
revoke all on table public.marketing_youtube_shorts from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.marketing_youtube_connexion to service_role';
    execute 'grant select, insert, update, delete on table public.marketing_youtube_shorts to service_role';
  else
    raise notice 'service_role absent : droits non accordés (environnement hors Supabase)';
  end if;
end $$;

-- ---------- 4. Réglages du canal, éteint ----------
-- La liste des plateformes est fermée par une contrainte (00045) : on
-- l'élargit à YouTube, en la recréant à l'identique pour le reste.
alter table public.marketing_parametres drop constraint if exists marketing_parametres_plateforme_connue;
alter table public.marketing_parametres add constraint marketing_parametres_plateforme_connue
  check (plateforme in ('global', 'instagram', 'facebook', 'pinterest', 'youtube'));

insert into public.marketing_parametres (plateforme, mode, actif)
values ('youtube', 'automatique', false)
on conflict (plateforme) do nothing;

commit;
