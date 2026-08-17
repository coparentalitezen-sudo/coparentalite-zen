-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00041 : socle de l'automatisation marketing
--
-- BESOIN
-- Détecter les besoins récurrents des parents séparés, en tirer des contenus,
-- les publier sur Instagram et Facebook, puis mesurer ce que chacun rapporte.
-- Ces six tables portent la mémoire du dispositif : sans elles, un contenu
-- publié deux fois ne serait pas détectable, et aucune amélioration ne
-- pourrait s'appuyer sur autre chose qu'une impression.
--
-- SÉCURITÉ
-- Aucune de ces tables ne concerne un foyer, un parent ou un enfant. Elles ne
-- doivent donc être lisibles par aucun compte connecté. La RLS est activée
-- SANS aucune politique : c'est la fermeture la plus stricte que PostgreSQL
-- permette. Seul service_role, qui contourne la RLS, y accède — et seulement
-- depuis des routes serveur qui vérifient d'abord que l'appelant est
-- administrateur de la plateforme.
--
-- Les droits sont accordés explicitement à service_role. La leçon de la
-- migration 00020 vaut ici : un « revoke from public » retire aussi le droit
-- implicite du rôle de service, et l'échec est alors silencieux en production
-- alors que tout passe en local.
--
-- DONNÉES PERSONNELLES
-- Le suivi d'audience est volontairement agrégé : marketing_visites compte des
-- clics par jour et par contenu, sans identifiant, sans adresse IP, sans
-- empreinte de navigateur. Rien ici ne permet de reconstituer une personne, et
-- encore moins un enfant. C'est ce qui dispense ce comptage de consentement.
--
-- STATUTS
-- Les statuts sont des colonnes text contraintes plutôt que des types enum :
-- ils changeront au fil des semaines, et faire évoluer une contrainte coûte
-- une ligne là où faire évoluer un type enum coûte une migration prudente.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Micro-niches ----------
-- Le référentiel des sujets suivis. Volontairement une table et non une
-- constante du code : désactiver une niche qui ne prend pas ne doit pas
-- demander un déploiement.
create table if not exists marketing_niches (
  id text primary key,                          -- ex. 'garde-alternee'
  libelle text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 2. Opportunités détectées ----------
-- Une opportunité est un problème observé, daté et sourcé. La source est
-- obligatoire : une opportunité sans provenance vérifiable serait une
-- intuition déguisée en donnée.
create table if not exists marketing_opportunites (
  id uuid primary key default gen_random_uuid(),
  niche_id text not null references marketing_niches(id),
  probleme text not null,                       -- le problème vécu par le parent
  intention text not null,                      -- ce qu'il cherche à faire
  angle text not null,                          -- l'angle du contenu
  fonctionnalite text not null,                 -- la fonctionnalité à mettre en avant
  score numeric(5,2) not null default 0,
  details_score jsonb not null default '{}'::jsonb,  -- les huit sous-scores, détaillés
  source text not null,                         -- nom lisible de la source
  source_url text,
  detectee_le date not null default current_date,
  statut text not null default 'idee'
    check (statut in ('idee','validee','produite','publiee','rejetee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_opportunites_score
  on marketing_opportunites (statut, score desc);

-- ---------- 3. Contenus produits ----------
-- Un contenu porte son texte pour les deux plateformes. Publier le même texte
-- des deux côtés est le défaut que cette table rend impossible : les deux
-- colonnes existent séparément et sont toutes deux obligatoires.
create table if not exists marketing_contenus (
  id uuid primary key default gen_random_uuid(),
  opportunite_id uuid not null references marketing_opportunites(id) on delete cascade,
  format text not null check (format in ('reel','carrousel','publication')),
  categorie text not null
    check (categorie in ('conseil','quotidien','demonstration','modele','marque')),
  accroche text not null,
  pages jsonb not null default '[]'::jsonb,     -- planches du carrousel ou plans du Reel
  legende_instagram text not null,
  legende_facebook text not null,
  texte_alternatif text not null,               -- accessibilité : jamais facultatif
  hashtags text[] not null default '{}',
  appel_action text not null,
  visuels jsonb not null default '[]'::jsonb,   -- chemins dans le seau de stockage
  prevu_le date,
  statut text not null default 'brouillon'
    check (statut in ('brouillon','en_attente','valide','rejete','publie','echec')),
  motif_rejet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_contenus_hashtags_raisonnables
    check (array_length(hashtags, 1) is null or array_length(hashtags, 1) <= 8)
);

create index if not exists idx_marketing_contenus_file
  on marketing_contenus (statut, prevu_le);

-- ---------- 4. Publications ----------
-- Une ligne par plateforme et par contenu. La clé d'idempotence est unique :
-- c'est elle, et non une vérification applicative, qui empêche qu'un
-- réessai après une erreur réseau produise une seconde publication.
create table if not exists marketing_publications (
  id uuid primary key default gen_random_uuid(),
  contenu_id uuid not null references marketing_contenus(id) on delete cascade,
  plateforme text not null check (plateforme in ('instagram','facebook')),
  cle_idempotence text not null unique,
  meta_media_id text,                           -- identifiant rendu par Meta : la preuve
  statut text not null default 'en_attente'
    check (statut in ('en_attente','envoyee','publiee','echec','abandonnee')),
  tentatives smallint not null default 0,
  derniere_erreur text,                         -- message technique, jamais de jeton
  publie_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contenu_id, plateforme)
);

-- ---------- 5. Mesures ----------
-- Relevées chaque semaine auprès de Meta. Une ligne par jour de relevé : on
-- conserve l'historique plutôt que d'écraser, faute de quoi une baisse de
-- portée resterait invisible.
create table if not exists marketing_mesures (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references marketing_publications(id) on delete cascade,
  releve_le date not null default current_date,
  portee integer,
  vues integer,
  interactions integer,
  taux_lecture numeric(5,2),
  created_at timestamptz not null default now(),
  unique (publication_id, releve_le)
);

-- ---------- 6. Visites attribuées ----------
-- Comptage agrégé des arrivées portant des paramètres UTM. Aucune ligne ne
-- décrit une personne : le grain le plus fin est « ce jour, ce contenu, tant
-- de clics ».
create table if not exists marketing_visites (
  jour date not null default current_date,
  source text not null,
  campagne text not null,
  contenu text not null,
  clics integer not null default 0,
  primary key (jour, source, campagne, contenu)
);

-- ---------- 7. Paramètres du dispositif ----------
-- Table à ligne unique. Le mode de départ est « validation » : rien ne part
-- sans un accord humain tant que ce réglage n'est pas changé sciemment.
create table if not exists marketing_parametres (
  id boolean primary key default true check (id),
  mode text not null default 'validation' check (mode in ('validation','automatique')),
  actif boolean not null default false,         -- interrupteur général, éteint au départ
  cadence jsonb not null default
    '{"1":"reel","2":"carrousel","3":"publication","4":"reel","5":"carrousel","6":"reel","0":"publication"}'::jsonb,
  suspendu_motif text,
  updated_at timestamptz not null default now()
);

insert into marketing_parametres (id) values (true) on conflict (id) do nothing;

-- ---------- 8. Origine d'une inscription ----------
-- Première source connue, et elle seule. Écraser à chaque visite ferait
-- attribuer l'inscription au dernier lien cliqué plutôt qu'à celui qui a
-- réellement fait connaître l'application.
alter table profiles add column if not exists origine_source text;
alter table profiles add column if not exists origine_campagne text;
alter table profiles add column if not exists origine_contenu text;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_terms text := nullif(new.raw_user_meta_data->>'terms_version', '');
  v_privacy text := nullif(new.raw_user_meta_data->>'privacy_version', '');
begin
  insert into public.profiles (id, email, display_name,
                               origine_source, origine_campagne, origine_contenu)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
          -- Bornées à 64 caractères : ces valeurs viennent d'une URL publique,
          -- donc de n'importe qui. Elles ne servent qu'à compter.
          left(nullif(new.raw_user_meta_data->>'utm_source', ''), 64),
          left(nullif(new.raw_user_meta_data->>'utm_campaign', ''), 64),
          left(nullif(new.raw_user_meta_data->>'utm_content', ''), 64))
  on conflict (id) do nothing;

  if coalesce((new.raw_user_meta_data->>'terms_accepted')::boolean, false) and v_terms is not null then
    insert into public.consent_logs(profile_id, consent_kind, version, granted)
    select new.id, 'terms', v_terms, true
    where not exists (
      select 1 from public.consent_logs
      where profile_id = new.id and consent_kind = 'terms' and version = v_terms and granted
    );
  end if;

  if coalesce((new.raw_user_meta_data->>'privacy_accepted')::boolean, false) and v_privacy is not null then
    insert into public.consent_logs(profile_id, consent_kind, version, granted)
    select new.id, 'privacy', v_privacy, true
    where not exists (
      select 1 from public.consent_logs
      where profile_id = new.id and consent_kind = 'privacy' and version = v_privacy and granted
    );
  end if;

  return new;
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------- 9. Comptage d'une visite ----------
-- Fonction plutôt qu'un insert depuis l'application : le compteur doit
-- s'incrémenter en une seule opération, sinon deux visites simultanées se
-- perdraient l'une l'autre.
create or replace function public.compter_visite(
  p_source text, p_campagne text, p_contenu text
) returns void
language sql security definer set search_path = public as $$
  insert into public.marketing_visites (jour, source, campagne, contenu, clics)
  values (current_date, left(p_source, 64), left(p_campagne, 64), left(p_contenu, 64), 1)
  on conflict (jour, source, campagne, contenu)
  do update set clics = public.marketing_visites.clics + 1;
$$;

revoke all on function public.compter_visite(text, text, text) from public, anon, authenticated;

-- ---------- 10. Fermeture ----------
do $$
declare t text;
begin
  foreach t in array array[
    'marketing_niches','marketing_opportunites','marketing_contenus',
    'marketing_publications','marketing_mesures','marketing_visites',
    'marketing_parametres'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Aucune politique n'est créée : RLS active sans politique interdit tout
    -- accès aux rôles clients. C'est délibéré et ne doit pas être « corrigé ».
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach t in array array[
      'marketing_niches','marketing_opportunites','marketing_contenus',
      'marketing_publications','marketing_mesures','marketing_visites',
      'marketing_parametres'
    ] loop
      execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    end loop;
    execute 'grant execute on function public.compter_visite(text, text, text) to service_role';
    execute 'grant execute on function public.handle_new_user() to service_role';
  else
    raise notice 'service_role absent : droits non accordés (environnement hors Supabase)';
  end if;
end $$;

-- ---------- 11. Amorce des micro-niches ----------
insert into marketing_niches (id, libelle) values
  ('garde-alternee',      'Calendrier de garde alternée'),
  ('vacances-scolaires',  'Vacances scolaires et jours fériés'),
  ('echange-enfants',     'Échange des enfants'),
  ('depenses-partagees',  'Dépenses partagées'),
  ('pension',             'Pension et justificatifs'),
  ('ecole-activites',     'École et activités extrascolaires'),
  ('rendez-vous-medicaux','Rendez-vous médicaux'),
  ('documents-familiaux', 'Documents familiaux'),
  ('communication',       'Communication apaisée'),
  ('nouveaux-conjoints',  'Nouveaux conjoints'),
  ('familles-recomposees','Familles recomposées'),
  ('longue-distance',     'Longue distance entre les parents'),
  ('imprevus',            'Oublis et changements de dernière minute'),
  ('anniversaires',       'Organisation des anniversaires et fêtes'),
  ('conflits-planning',   'Conflits liés au planning')
on conflict (id) do nothing;

commit;
