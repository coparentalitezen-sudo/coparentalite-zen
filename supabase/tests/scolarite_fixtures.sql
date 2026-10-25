-- Fixtures dédiées à scolarite_test.sql (exécuté en superuser).
--
-- Un foyer NEUF, séparé de ceux de rls_fixtures.sql : activer le plan
-- premium ici ne doit avoir aucun effet sur les autres suites (premium_test.sql
-- notamment), qui s'appuient sur le foyer A resté gratuit.
--
-- Foyer Édu (premium, actif) : Diane (owner), enfant Nora.
-- Foyer Édu Gratuit : Erik (owner), enfant Owen — pour vérifier le refus
-- d'entitlement sur un foyer non premium.

-- Identifiants propres (d5, d6) : e1 et e2 appartiennent déjà aux comptes du
-- parent provisoire créés par rls_fixtures.sql, et les réutiliser faisait
-- échouer ce fichier entier sur une clé dupliquée — donc toute la suite.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d5','diane@test.fr'),
  ('00000000-0000-0000-0000-0000000000d6','erik@test.fr')
on conflict (id) do nothing;
insert into profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000000d5','diane@test.fr','Diane'),
  ('00000000-0000-0000-0000-0000000000d6','erik@test.fr','Erik')
on conflict (id) do update set email = excluded.email, display_name = excluded.display_name;

insert into households (id, name, created_by) values
  ('eeeeeeee-1111-0000-0000-000000000001','Foyer Édu','00000000-0000-0000-0000-0000000000d5'),
  ('eeeeeeee-1111-0000-0000-000000000002','Foyer Édu Gratuit','00000000-0000-0000-0000-0000000000d6');

insert into household_members (household_id, profile_id, role, color_key) values
  ('eeeeeeee-1111-0000-0000-000000000001','00000000-0000-0000-0000-0000000000d5','owner','navy'),
  ('eeeeeeee-1111-0000-0000-000000000002','00000000-0000-0000-0000-0000000000d6','owner','navy');

insert into children (id, household_id, first_name, created_by) values
  ('cccccccc-1111-0000-0000-000000000001','eeeeeeee-1111-0000-0000-000000000001','Nora','00000000-0000-0000-0000-0000000000d5'),
  ('cccccccc-1111-0000-0000-000000000002','eeeeeeee-1111-0000-0000-000000000002','Owen','00000000-0000-0000-0000-0000000000d6');

insert into subscriptions (household_id, plan_id, status, current_period_end) values
  ('eeeeeeee-1111-0000-0000-000000000001','premium','active', now() + interval '1 year');

-- Le flag reste absent/false pour tout le monde par défaut (voir la
-- migration 00050) : ici, en base de test uniquement, on l'active pour
-- 'premium' afin de pouvoir tester le chemin nominal. 'free' reste sans le
-- flag, pour vérifier le refus.
update plans set limits = limits || '{"edt_scolaire_enabled": true}'::jsonb
 where id = 'premium';
