-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00051 : boucle d'amélioration Pinterest
--
-- BESOIN
-- La publication Pinterest est passive : Pinterest relit notre flux RSS et
-- crée les épingles de son côté (docs/PINTEREST.md). Nous n'appelons donc
-- jamais de endpoint de création et ne recevons jamais d'id en retour. Pour
-- mesurer ce que chaque épingle rapporte, il faut d'abord la retrouver côté
-- Pinterest — en rapprochant son lien du paramètre utm_content, qui porte
-- déjà la référence stable du contenu (migrations 00042/00044) — puis
-- interroger son analytique.
--
-- POURQUOI DEUX COLONNES SUR marketing_contenus ET NON UNE TABLE À PART
-- Un contenu a au plus une épingle Pinterest : la relation est 1-1, pas 1-N.
-- Une table de correspondance séparée n'apporterait rien qu'un index unique
-- partiel n'apporte déjà, et obligerait chaque lecture à une jointure de plus.
--
-- POURQUOI pin_stats GARDE UNE LIGNE PAR RELEVÉ
-- Comme marketing_mesures pour Meta : écraser un relevé précédent rendrait
-- invisible une progression ou une chute, et jours_depuis_pub permet de
-- comparer deux épingles au même âge plutôt qu'à la même date calendaire.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Correspondance épingle ↔ contenu ----------
alter table marketing_contenus add column if not exists pin_id text;
-- Date de création de l'épingle telle que Pinterest la rapporte (champ
-- created_at du pin), pas la date à laquelle nous l'avons découverte : c'est
-- elle qui fait foi pour calculer jours_depuis_pub.
alter table marketing_contenus add column if not exists pin_cree_le timestamptz;

create unique index if not exists idx_marketing_contenus_pin_id
  on marketing_contenus (pin_id) where pin_id is not null;

-- ---------- 2. Relevés d'analytique par épingle ----------
create table if not exists pin_stats (
  id uuid primary key default gen_random_uuid(),
  pin_id text not null,
  contenu_id uuid not null references marketing_contenus(id) on delete cascade,
  collecte_le date not null default current_date,
  jours_depuis_pub integer not null check (jours_depuis_pub >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  saves integer not null default 0 check (saves >= 0),
  pin_clicks integer not null default 0 check (pin_clicks >= 0),
  outbound_clicks integer not null default 0 check (outbound_clicks >= 0),
  created_at timestamptz not null default now(),
  unique (pin_id, collecte_le)
);

create index if not exists idx_pin_stats_contenu on pin_stats (contenu_id);

-- ---------- 3. Bilan textuel de la boucle Pinterest ----------
-- Une ligne par génération, jamais écrasée : comme marketing_bilans, revoir
-- une décision passée suppose de savoir sur quel signal elle reposait.
create table if not exists learnings (
  id uuid primary key default gen_random_uuid(),
  genere_le timestamptz not null default now(),
  nb_pins integer not null check (nb_pins >= 0),
  bloc text not null
);

-- ---------- 4. Fermeture ----------
-- Même politique que la migration 00041 : aucune de ces données ne concerne
-- un foyer, un parent ou un enfant ; RLS activée sans policy, seul
-- service_role y accède, depuis des routes serveur qui vérifient déjà que
-- l'appelant est administrateur ou porteur du secret de tâche planifiée.
do $$
declare t text;
begin
  foreach t in array array['pin_stats', 'learnings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach t in array array['pin_stats', 'learnings'] loop
      execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    end loop;
  else
    raise notice 'service_role absent : droits non accordés (environnement hors Supabase)';
  end if;
end $$;

commit;
