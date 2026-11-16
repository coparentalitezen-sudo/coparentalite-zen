-- 00066_copilote_contenus.sql
-- Copilote, itération 2 : des publications qui mènent aux fiches Etsy.
--
-- Chaque semaine, le copilote prépare des publications sur les produits des
-- boutiques. Une publication validée entre dans marketing_reserve, que la
-- tâche quotidienne publie déjà sur Instagram et Facebook ; elle figure aussi
-- dans le flux Pinterest. Rien n'entre dans la réserve sans validation (ou
-- sans l'auto-validation activée à la main) : la réserve, elle, publie tout
-- ce qu'on y dépose.
-- APPLIQUÉE EN PRODUCTION le 16/11/2026.

-- ---------- Fiches : adresse publique et image ----------
alter table public.boutique_produits
  add column if not exists url text check (url is null or url ~ '^https://'),
  add column if not exists image_url text check (image_url is null or image_url ~ '^https://');

-- ---------- Réserve : une légende propre à Facebook ----------
-- Sur Facebook un lien est cliquable dans la publication ; sur Instagram il ne
-- l'est pas. Une seule légende obligeait à choisir. Facultative : absente,
-- Facebook reprend la légende commune, comme avant.
alter table public.marketing_reserve
  add column if not exists legende_facebook text
    check (legende_facebook is null or length(trim(legende_facebook)) > 0);

-- ---------- Publications produits ----------
create table if not exists public.copilote_contenus (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique
    check (reference ~ '^[a-z0-9-]{1,64}$'),
  produit_id            uuid not null references public.boutique_produits(id) on delete cascade,
  semaine               text not null,
  angle                 text not null,
  accroche              text not null,
  appel_visuel          text not null,
  legende_instagram     text not null,
  legende_facebook      text not null,
  texte_alternatif      text not null,
  titre_pinterest       text not null,
  description_pinterest text not null,
  date_publication      date not null,
  statut                text not null default 'en_attente'
    check (statut in ('en_attente','rejete','programme')),
  reserve_id            uuid references public.marketing_reserve(id) on delete set null,
  motif                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists copilote_contenus_file
  on public.copilote_contenus (statut, date_publication);

-- ---------- Réglages du copilote ----------
create table if not exists public.copilote_parametres (
  cle        text primary key,
  valeur     jsonb not null,
  updated_at timestamptz not null default now()
);

-- Départ en validation manuelle : rien ne part sans un accord explicite tant
-- que ce réglage n'est pas changé sciemment.
insert into public.copilote_parametres (cle, valeur)
values ('auto_valider', 'false'::jsonb)
on conflict (cle) do nothing;

-- ---------- Fermeture et droits ----------
do $$
declare t text;
begin
  foreach t in array array['copilote_contenus','copilote_parametres'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

comment on table public.copilote_contenus is
  'Publications sur les produits des boutiques, à valider dans /admin/contenus avant d''entrer dans marketing_reserve.';
