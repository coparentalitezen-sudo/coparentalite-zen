-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00042 : références stables
--
-- BESOIN
-- Le générateur est déterministe : relancer la production d'une semaine
-- redonne exactement les mêmes contenus. Encore faut-il que la base le sache,
-- sinon chaque relance créerait une seconde série de brouillons à trier —
-- précisément ce que le déterminisme était censé éviter.
--
-- Une référence unique par opportunité et par contenu suffit : l'écriture
-- devient un « insert ... on conflict do nothing », et la relance ne coûte
-- rien. C'est la base qui garantit l'unicité, pas une vérification préalable
-- de l'application, laquelle serait perdante en cas d'appels simultanés.
--
-- FORME DE LA RÉFÉRENCE
-- « 2026s34-carrousel-2 » : l'année, la semaine ISO, le format, le rang. Elle
-- sert aussi de valeur utm_content, ce qui permet de relier un clic à son
-- contenu sans table de correspondance.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

alter table marketing_opportunites add column if not exists reference text;
alter table marketing_contenus add column if not exists reference text;

-- Index uniques partiels : les lignes créées à la main, sans référence,
-- restent possibles et ne se gênent pas entre elles.
create unique index if not exists idx_marketing_opportunites_reference
  on marketing_opportunites (reference) where reference is not null;

create unique index if not exists idx_marketing_contenus_reference
  on marketing_contenus (reference) where reference is not null;

commit;
