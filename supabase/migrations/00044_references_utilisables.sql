-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00044 : rendre les références utilisables
--
-- CE QUI N'ALLAIT PAS
-- La migration 00042 posait des index uniques *partiels* sur les colonnes
-- reference, afin que des lignes créées à la main sans référence restent
-- possibles. L'intention était bonne, le moyen mauvais : PostgreSQL n'infère
-- pas un index partiel pour un « on conflict (reference) » à moins d'en
-- répéter la condition. Toutes les écritures échouaient donc — sans bruit,
-- puisque le code n'inspectait pas l'erreur de l'insertion des contenus.
--
-- Résultat observé en production : sept contenus affichés à l'écran, zéro en
-- base, une validation qui ne validait rien et un badge « Validé » mensonger.
--
-- CE QUI LE REMPLACE
-- Une contrainte unique ordinaire. Elle autorise déjà plusieurs valeurs
-- nulles — en SQL, deux NULL ne sont pas réputés égaux — de sorte que le
-- besoin qui avait motivé l'index partiel était satisfait dès le départ.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

drop index if exists idx_marketing_opportunites_reference;
drop index if exists idx_marketing_contenus_reference;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_opportunites_reference_unique'
  ) then
    alter table marketing_opportunites
      add constraint marketing_opportunites_reference_unique unique (reference);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'marketing_contenus_reference_unique'
  ) then
    alter table marketing_contenus
      add constraint marketing_contenus_reference_unique unique (reference);
  end if;
end $$;

commit;
