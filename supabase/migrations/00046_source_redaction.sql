-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00046 : traçabilité de la rédaction
--
-- BESOIN
-- Un agent rédacteur (redacteur.ts) peut désormais écrire le texte d'un
-- contenu à la place de la recombinaison déterministe habituelle — banque.ts
-- choisit toujours l'idée (niche, catégorie, angle), seul le texte peut venir
-- d'un modèle de langage. Sans cette colonne, rien ne distinguerait après
-- coup un contenu rédigé par le modèle d'un contenu produit par la banque de
-- sujets, ce qui rendrait impossible de mesurer si l'un performe mieux que
-- l'autre — précisément la question que l'agent existe pour permettre de
-- poser.
--
-- DÉFAUT 'deterministe'
-- Tous les contenus déjà en base ont été produits par la recombinaison : le
-- défaut décrit correctement leur origine sans rien supposer sur des lignes
-- futures, qui la renseignent explicitement à l'écriture (depot.ts).
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

alter table marketing_contenus
  add column if not exists source text not null default 'deterministe';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_contenus_source_valide'
  ) then
    alter table marketing_contenus
      add constraint marketing_contenus_source_valide check (source in ('llm', 'deterministe'));
  end if;
end $$;

commit;
