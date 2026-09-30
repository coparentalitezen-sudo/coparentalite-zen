-- 00056_journal_taches_marketing.sql
-- Trace de chaque exécution des tâches marketing, y compris — surtout — celles
-- qui n'ont rien publié. Les journaux de l'hébergeur sont effacés au bout
-- d'une heure : le 30 septembre, la chaîne s'est arrêtée au moment de basculer
-- sur le visuel quotidien et il a fallu quatre jours pour s'en apercevoir.
-- APPLIQUÉE EN PRODUCTION le 30/09/2026.

create table if not exists public.marketing_journal (
  id         uuid primary key default gen_random_uuid(),
  tache      text not null,
  jour       date not null,
  source     text,
  publie     boolean not null default false,
  rapport    jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists marketing_journal_recent
  on public.marketing_journal (tache, created_at desc);

alter table public.marketing_journal enable row level security;
revoke all on public.marketing_journal from anon, authenticated;

comment on table public.marketing_journal is
  'Rapport de chaque exécution des tâches marketing, pour que « rien n''est parti » reste explicable au-delà d''une heure.';
