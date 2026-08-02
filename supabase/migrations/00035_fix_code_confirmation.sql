-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00035 : réparation du code de confirmation
--
-- SYMPTÔME
-- « Créer le lien d'invitation » échouait systématiquement :
--   function gen_random_bytes(integer) does not exist · 42883
--
-- CAUSE
-- gen_random_bytes appartient à pgcrypto. Supabase installe ses extensions
-- dans le schéma « extensions », jamais dans public — si bien que le
-- « create extension if not exists pgcrypto » de la migration 00001 n'y a
-- aucun effet : l'extension est déjà là, ailleurs.
--
-- generer_code_confirmation ne fixait pas son search_path. Elle héritait donc
-- de celui de son appelante, create_invitation, limité à public. pgcrypto
-- restait hors de portée. La création de la fonction, elle, avait réussi :
-- l'éditeur SQL de Supabase travaille avec « public, extensions » — d'où une
-- migration verte et une panne à l'exécution seulement.
--
-- Le banc de test n'a rien vu pour la raison symétrique : il installait
-- pgcrypto dans public, où tout se résolvait de soi-même. Il reproduit
-- désormais l'implantation Supabase (scripts/test-sql.sh).
--
-- CORRECTION
-- Un search_path explicite citant les deux schémas — l'extension est trouvée
-- qu'elle réside dans public (installation locale) ou dans extensions
-- (Supabase). La migration 00032 porte le même correctif pour les bases
-- créées de zéro ; celle-ci répare les bases déjà migrées.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- Sans effet si l'extension existe déjà, quel que soit son schéma d'accueil.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.generer_code_confirmation()
returns text
language sql volatile
set search_path = public, extensions, pg_catalog
as $$
  select lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0')
$$;

-- Les droits d'exécution sont rejoués : un « create or replace » les conserve,
-- mais rien ne garantit qu'ils aient été posés si 00032 a été appliquée
-- partiellement.
grant execute on function public.generer_code_confirmation() to authenticated, service_role;

-- Vérification immédiate : la migration refuse de s'achever sur une fonction
-- qui ne produirait pas un code valide. Mieux vaut échouer ici qu'au premier
-- parent qui tente d'inviter.
do $$
declare essai text;
begin
  for i in 1..20 loop
    essai := public.generer_code_confirmation();
    if essai !~ '^[0-9]{6}$' then
      raise exception 'Code de confirmation mal formé : %', essai;
    end if;
  end loop;
  raise notice 'Code de confirmation : 20 tirages valides.';
end $$;

commit;
