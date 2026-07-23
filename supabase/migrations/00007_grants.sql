-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00007 : privilèges du rôle applicatif
--
-- Sur PostgreSQL, la Row Level Security filtre les LIGNES, mais elle
-- ne remplace pas les privilèges de TABLE. Sans GRANT, le rôle
-- « authenticated » reçoit « permission denied for table … » avant même
-- que les policies ne s'appliquent.
--
-- Les fonctions SECURITY DEFINER (create_household, accept_invitation…)
-- masquaient l'omission : elles s'exécutent avec les droits du
-- propriétaire. Seules les lectures directes échouaient.
--
-- Sécurité : accorder ces privilèges est sans risque ici car la RLS est
-- active sur TOUTES les tables (migration 00002) et une table sans policy
-- refuse tout. Les droits de table ouvrent la porte ; les policies
-- décident qui passe.
-- Idempotent : les GRANT peuvent être rejoués indéfiniment.
-- ============================================================

-- (on n'accorde qu'aux rôles réellement présents : « anon » n'existe que sur Supabase)
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on schema public to %I', r);
    end if;
  end loop;
end $$;

-- Lecture/écriture au niveau table : la RLS filtre ensuite ligne par ligne
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Vue des données médicales (réservée aux parents par la vue elle-même)
grant select on public.children_medical to authenticated;

-- Séquences éventuelles (colonnes generated as identity : audit_logs, consent_logs)
grant usage, select on all sequences in schema public to authenticated;

-- Tables créées plus tard : mêmes droits par défaut
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- Fonctions serveur (rappel : déjà accordées en 00004 et 00006, rejoué ici
-- pour qu'une installation partielle reste cohérente)
grant execute on all functions in schema public to authenticated;

-- Contrôle : aucune table du schéma public ne doit rester sans RLS
do $$
declare manquantes text;
begin
  select string_agg(c.relname, ', ') into manquantes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if manquantes is not null then
    raise exception 'RLS absente sur : % — ne pas accorder de privilèges sans RLS', manquantes;
  end if;
end $$;
