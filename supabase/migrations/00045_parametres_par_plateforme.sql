-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00045 : réglages par plateforme
--
-- CE QUI N'ALLAIT PAS
-- marketing_parametres ne comptait qu'une seule ligne, portant le mode et
-- l'interrupteur général. Tant qu'un seul canal existait, cela suffisait.
-- L'arrivée d'un second canal a révélé le défaut : activer la publication
-- automatique pour Pinterest l'a activée pour Instagram et Facebook, sans que
-- personne ne l'ait voulu ni ne s'en aperçoive.
--
-- Un réglage partagé entre des canaux indépendants est une commande à
-- distance involontaire. Chaque plateforme doit répondre d'elle-même.
--
-- CE QUI LE REMPLACE
-- Une ligne par plateforme, avec ses propres mode et interrupteur. La ligne
-- historique est conservée sous la clé « global » : elle sert désormais
-- d'arrêt d'urgence commun — quand elle est éteinte, plus rien ne part, quelle
-- que soit la plateforme. Un bouton qui arrête tout doit rester, mais il ne
-- doit pas être le seul.
--
-- PRUDENCE À LA REPRISE
-- Les nouvelles lignes naissent en mode validation et interrupteur fermé,
-- quel que soit l'état de la ligne globale. Hériter d'un réglage dont on
-- vient de constater qu'il avait été activé par erreur reviendrait à
-- propager l'erreur.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

alter table marketing_parametres
  add column if not exists plateforme text not null default 'global';

-- La clé primaire booléenne interdisait toute seconde ligne : c'était le
-- moyen de garantir l'unicité, il devient l'obstacle.
alter table marketing_parametres drop constraint if exists marketing_parametres_pkey;
alter table marketing_parametres drop constraint if exists marketing_parametres_id_check;
alter table marketing_parametres alter column id drop default;
-- La contrainte NOT NULL survit à la suppression de la clé primaire : sans
-- cette ligne, toute insertion sans « id » échouerait.
alter table marketing_parametres alter column id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_parametres_plateforme_unique'
  ) then
    alter table marketing_parametres
      add constraint marketing_parametres_plateforme_unique unique (plateforme);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'marketing_parametres_plateforme_connue'
  ) then
    alter table marketing_parametres
      add constraint marketing_parametres_plateforme_connue
      check (plateforme in ('global', 'instagram', 'facebook', 'pinterest'));
  end if;
end $$;

-- Chaque canal démarre fermé et en validation, sans hériter de l'existant.
insert into marketing_parametres (plateforme, mode, actif)
values ('instagram', 'validation', false),
       ('facebook',  'validation', false),
       ('pinterest', 'validation', false)
on conflict (plateforme) do nothing;

commit;
