-- 00057_droits_service_role_marketing.sql
-- Le compte de service n'avait aucun droit de lecture ni d'écriture sur
-- marketing_reserve ni marketing_journal : le « revoke all from anon,
-- authenticated » de 00053 a emporté les droits par défaut au-delà des deux
-- rôles visés.
--
-- Conséquence invisible pendant cinq jours : la réserve fonctionnait quand
-- même, parce qu'elle passe par des fonctions SECURITY DEFINER qui ignorent
-- les droits de table, mais le visuel quotidien écrit en direct — il échouait
-- chaque matin sans rien dire, et le journal des tâches ne pouvait pas
-- davantage s'écrire, ce qui faisait passer la panne pour une tâche qui ne se
-- déclenchait pas.
-- APPLIQUÉE EN PRODUCTION le 01/10/2026.

grant select, insert, update, delete on public.marketing_reserve to service_role;
grant select, insert, update, delete on public.marketing_journal to service_role;
