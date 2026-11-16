-- 00065_copilote_boutique.sql
-- Copilote business : ventes et fiches des boutiques de produits numériques
-- (Etsy, Payhip, Gumroad), propositions hebdomadaires et rapports.
--
-- Les données arrivent par import de fichiers CSV depuis /admin/boutique :
-- Payhip n'a pas d'API de ventes, celle d'Etsy exige une application validée.
-- Un import doit pouvoir être rejoué sans doubler les ventes : c'est la clé
-- unique (plateforme, commande, ligne) qui le garantit, pas la prudence de
-- l'opérateur.
--
-- Accès : comme le reste du dispositif marketing, uniquement par la clé de
-- service. RLS activée sans politique, droits retirés à anon/authenticated,
-- puis accordés EXPLICITEMENT à service_role — le « revoke all » seul a déjà
-- emporté ses droits une fois (voir 00057).
-- APPLIQUÉE EN PRODUCTION le 16/11/2026.

-- ---------- Imports : la trace de chaque fichier déposé ----------
create table if not exists public.boutique_imports (
  id            uuid primary key default gen_random_uuid(),
  plateforme    text not null
    check (plateforme in ('etsy','payhip','gumroad','generique')),
  type          text not null check (type in ('ventes','catalogue','vues')),
  fichier       text,
  lignes_lues   integer not null default 0 check (lignes_lues >= 0),
  ajoutees      integer not null default 0 check (ajoutees >= 0),
  ignorees      integer not null default 0 check (ignorees >= 0),
  erreurs       jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists boutique_imports_recents
  on public.boutique_imports (created_at desc);

-- ---------- Ventes : une ligne par article vendu ----------
create table if not exists public.boutique_ventes (
  id               uuid primary key default gen_random_uuid(),
  plateforme       text not null check (plateforme in ('etsy','payhip','gumroad')),
  commande         text not null,
  ligne            text not null default '',
  produit_ref      text not null,
  titre            text not null,
  quantite         integer not null default 1 check (quantite > 0),
  montant_centimes integer not null check (montant_centimes >= 0),
  devise           text not null default 'EUR',
  vendu_le         date not null,
  import_id        uuid references public.boutique_imports(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (plateforme, commande, ligne)
);

create index if not exists boutique_ventes_date
  on public.boutique_ventes (vendu_le desc);

-- ---------- Catalogue : les fiches telles qu'elles sont en ligne ----------
create table if not exists public.boutique_produits (
  id            uuid primary key default gen_random_uuid(),
  plateforme    text not null check (plateforme in ('etsy','payhip','gumroad')),
  reference     text not null,
  titre         text not null,
  prix_centimes integer check (prix_centimes is null or prix_centimes >= 0),
  devise        text not null default 'EUR',
  tags          text[] not null default '{}',
  description   text not null default '',
  updated_at    timestamptz not null default now(),
  unique (plateforme, reference)
);

-- ---------- Vues : relevés saisis à la main ou exportés ----------
-- Une ligne par produit et par date de relevé. Les vues couvrent les trente
-- jours qui précèdent le relevé, comme le tableau de statistiques d'Etsy.
create table if not exists public.boutique_vues (
  id            uuid primary key default gen_random_uuid(),
  plateforme    text not null check (plateforme in ('etsy','payhip','gumroad')),
  produit_ref   text not null,
  titre         text not null,
  vues          integer not null check (vues >= 0),
  releve_le     date not null,
  created_at    timestamptz not null default now(),
  unique (plateforme, produit_ref, releve_le)
);

-- ---------- Propositions de la semaine ----------
-- « cle » est déterministe : recalculer la semaine met à jour les propositions
-- encore en attente sans créer de doublon, et ne touche jamais à une décision
-- déjà prise.
create table if not exists public.copilote_propositions (
  id          uuid primary key default gen_random_uuid(),
  semaine     text not null,
  type        text not null check (type in ('idee','amelioration')),
  cle         text not null,
  rang        integer not null default 0,
  titre       text not null,
  contenu     jsonb not null,
  statut      text not null default 'en_attente'
    check (statut in ('en_attente','validee','rejetee','realisee')),
  motif       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (semaine, cle)
);

create index if not exists copilote_propositions_semaine
  on public.copilote_propositions (semaine, type, rang);

-- ---------- Rapports hebdomadaires ----------
create table if not exists public.copilote_rapports (
  semaine     text primary key,
  donnees     jsonb not null,
  texte       text not null,
  envoye_le   timestamptz,
  envoi_motif text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Fermeture et droits ----------
do $$
declare t text;
begin
  foreach t in array array[
    'boutique_imports','boutique_ventes','boutique_produits','boutique_vues',
    'copilote_propositions','copilote_rapports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

comment on table public.boutique_ventes is
  'Ventes des boutiques Etsy/Payhip/Gumroad importées par CSV. Réimporter un fichier ne double rien.';
comment on table public.copilote_propositions is
  'Idées de produits et améliorations de fiches proposées chaque semaine, à valider dans /admin/propositions.';
comment on table public.copilote_rapports is
  'Rapport hebdomadaire du copilote, affiché dans /admin/rapport et envoyé par courriel.';
