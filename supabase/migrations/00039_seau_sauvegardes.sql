-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00039 : seau des sauvegardes
--
-- BESOIN
-- Les sauvegardes de l'hébergeur protègent d'une panne de machine. Elles ne
-- protègent pas d'une erreur humaine : une migration maladroite, une
-- suppression de trop. Un relevé indépendant, lisible sans outil, permet de
-- reconstituer une table sans restaurer la base entière.
--
-- SÉCURITÉ
-- Ce seau contient l'intégralité des foyers. Aucune politique n'y donne accès
-- aux comptes connectés : seule la clé de service, dont l'application ne se
-- sert que dans la tâche planifiée, peut y déposer et y lire. C'est délibéré
-- — un droit de lecture accordé « juste pour vérifier » livrerait tout.
--
-- CONSERVATION
-- La purge n'est pas automatisée : effacer des sauvegardes sans surveillance
-- est le meilleur moyen de n'en avoir aucune le jour venu. Voir la marche à
-- suivre dans SAUVEGARDE-RESTAURATION.md.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('sauvegardes', 'sauvegardes', false, 104857600)
on conflict (id) do update set public = false;

-- Aucune politique pour authenticated ni anon : l'absence de politique vaut
-- interdiction. La clé de service n'est pas soumise à ces règles.
drop policy if exists "sauvegardes_lecture" on storage.objects;
drop policy if exists "sauvegardes_ecriture" on storage.objects;

do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'sauvegardes' and public = false
  ) then
    raise exception 'Le seau des sauvegardes doit rester privé';
  end if;
  raise notice 'Seau des sauvegardes prêt, et privé.';
end $$;

commit;
