-- Fixtures pour invitation_security_test.sql (exécuté en superuser).
-- Nécessite rls_fixtures.sql au préalable (foyers A et B, Alice, Bob, Carol, Mia).

-- Comptes auth avec adresses réelles ; le trigger crée les profils manquants
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a','alice@test.fr','{"display_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000c','carol@test.fr','{"display_name":"Carol"}'),
  ('00000000-0000-0000-0000-0000000000f3','parent2@test.fr','{"display_name":"Parent2"}'),
  ('00000000-0000-0000-0000-0000000000f4','etranger@test.fr','{"display_name":"Etranger"}')
on conflict (id) do update set email = excluded.email;

-- Invitations de test (foyer A, créées par Alice)
insert into invitations (household_id, email, token, status, expires_at, created_by) values
  -- 1 : valide, adressée à « Parent2@Test.FR » (casse + espaces volontaires)
  ('aaaaaaaa-0000-0000-0000-000000000001','  Parent2@Test.FR  ',
   '77777777-7777-7777-7777-777777777771','pending', now() + interval '7 days',
   '00000000-0000-0000-0000-00000000000a'),
  -- 2 : révoquée
  ('aaaaaaaa-0000-0000-0000-000000000001','parent2@test.fr',
   '77777777-7777-7777-7777-777777777772','revoked', now() + interval '7 days',
   '00000000-0000-0000-0000-00000000000a'),
  -- 3 : expirée
  ('aaaaaaaa-0000-0000-0000-000000000001','parent2@test.fr',
   '77777777-7777-7777-7777-777777777773','pending', now() - interval '1 day',
   '00000000-0000-0000-0000-00000000000a'),
  -- 4 : adressée à Carol, qui appartient déjà au foyer B
  ('aaaaaaaa-0000-0000-0000-000000000001','carol@test.fr',
   '77777777-7777-7777-7777-777777777774','pending', now() + interval '7 days',
   '00000000-0000-0000-0000-00000000000a'),
  -- 5 : sans adresse, rattachée à un numéro de téléphone
  ('aaaaaaaa-0000-0000-0000-000000000001', null,
   '77777777-7777-7777-7777-777777777775','pending', now() + interval '7 days',
   '00000000-0000-0000-0000-00000000000a'),
  -- 6 : sans adresse également, pour éprouver l'expiration
  ('aaaaaaaa-0000-0000-0000-000000000001', null,
   '77777777-7777-7777-7777-777777777776','pending', now() + interval '7 days',
   '00000000-0000-0000-0000-00000000000a')
on conflict (token) do nothing;

-- Vérificateurs hors-RLS : constater l'état réel indépendamment de ce que
-- l'utilisateur courant a le droit de voir (un compte refusé ne voit rien).
create or replace function public.test_statut_invitation(p_token uuid) returns text
language sql security definer set search_path = public as $$
  select status::text from invitations where token = p_token $$;

create or replace function public.test_nb_membres(p_household uuid) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from household_members
  where household_id = p_household and deleted_at is null $$;

create or replace function public.test_est_membre(p_household uuid, p_profile uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from household_members
                 where household_id = p_household and profile_id = p_profile
                   and deleted_at is null) $$;

grant execute on function public.test_statut_invitation(uuid) to authenticated;
grant execute on function public.test_nb_membres(uuid) to authenticated;
grant execute on function public.test_est_membre(uuid, uuid) to authenticated;
