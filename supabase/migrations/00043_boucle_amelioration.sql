-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00043 : boucle d'amélioration
--
-- BESOIN
-- La production doit se déplacer vers les sujets qui fonctionnent. Encore
-- faut-il que ce déplacement laisse une trace : sans poids enregistré, chaque
-- semaine repartirait de zéro et rien ne s'améliorerait jamais.
--
-- POURQUOI UN POIDS BORNÉ ET NON UN CLASSEMENT LIBRE
-- Un poids sans borne finit par écraser tout le reste : une niche ayant eu
-- deux bonnes semaines monopoliserait la production, et les quatorze autres
-- ne seraient plus jamais essayées — donc plus jamais mesurées. Les bornes
-- 0,25 et 3 garantissent qu'un sujet affaibli reste tiré de temps en temps,
-- et qu'un sujet performant ne prend jamais toute la place.
--
-- LES BILANS SONT CONSERVÉS
-- Un résumé écrasé chaque semaine ne permettrait pas de voir qu'une décision
-- prise en septembre reposait sur un signal qui s'est démenti depuis.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

alter table marketing_niches add column if not exists poids numeric(4,2) not null default 1;
alter table marketing_niches add column if not exists derniere_evaluation date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_niches_poids_borne'
  ) then
    alter table marketing_niches
      add constraint marketing_niches_poids_borne check (poids >= 0.25 and poids <= 3);
  end if;
end $$;

create table if not exists marketing_bilans (
  id uuid primary key default gen_random_uuid(),
  semaine text not null unique,             -- « 2026s34 »
  texte text not null,                      -- une page au plus, lisible tel quel
  details jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now()
);

alter table marketing_bilans enable row level security;
revoke all on table marketing_bilans from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.marketing_bilans to service_role;
  end if;
end $$;

commit;
