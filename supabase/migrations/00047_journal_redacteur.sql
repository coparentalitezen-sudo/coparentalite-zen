-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00047 : journal de l'agent rédacteur
--
-- BESOIN
-- redacteur.ts retombe silencieusement sur le texte déterministe à chaque
-- défaillance (échec d'appel, JSON non conforme, rejet par les garde-fous,
-- quota hebdomadaire atteint) — c'est le comportement voulu, pour que le
-- pipeline ne s'arrête jamais. Mais un repli qui ne laisse aucune trace ne
-- se distingue pas d'un agent qui ne s'est jamais déclenché : cette table
-- rend le repli observable, dans /admin/mesures.
--
-- POURQUOI resultat EST UNE COLONNE TEXT CONTRAINTE
-- Cinq issues possibles, connues d'avance et stables : une contrainte suffit,
-- un type enum coûterait une migration à chaque ajout.
--
-- POURQUOI motif RESTE UN CHAMP LIBRE
-- Le motif d'un rejet par les garde-fous nomme la règle déclenchée ; celui
-- d'un échec d'appel porte le message d'erreur (déjà expurgé de tout secret,
-- voir redacteur.ts) ; les deux ne prennent pas la même forme, et les
-- contraindre à une structure commune n'apporterait rien qu'un texte libre
-- n'apporte déjà.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

create table if not exists journal_redacteur (
  id uuid primary key default gen_random_uuid(),
  date timestamptz not null default now(),
  resultat text not null
    check (resultat in ('succes', 'echec_api', 'json_invalide', 'rejet_garde_fous', 'quota_atteint')),
  motif text
);

create index if not exists idx_journal_redacteur_date on journal_redacteur (date desc);

alter table journal_redacteur enable row level security;
revoke all on table journal_redacteur from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.journal_redacteur to service_role;
  end if;
end $$;

commit;
