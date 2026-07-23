-- Mock local de auth.users (existe nativement sur Supabase)
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'
);
-- Inscription de Nina et Oscar → le trigger doit créer leurs profils
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1','nina@test.fr','{"display_name":"Nina"}'),
  ('00000000-0000-0000-0000-0000000000f2','oscar@test.fr','{"display_name":"Oscar"}');
-- Invitation expirée (foyer A) pour le test T26
insert into invitations (household_id, email, token, status, expires_at, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000001','tard@test.fr',
        '99999999-9999-9999-9999-999999999999','pending', now() - interval '1 day',
        '00000000-0000-0000-0000-00000000000a');
-- Vérificateurs de test hors-RLS (security definer, tests uniquement)
create or replace function public.test_household_deleted(hid uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from households where id = hid and deleted_at is not null) $$;
grant execute on function public.test_household_deleted(uuid) to authenticated;

-- Vérificateur hors-RLS pour auth.users (le rôle applicatif n'y a aucun droit,
-- et c'est voulu : ne pas l'accorder juste pour faire passer un test).
create or replace function public.test_compte_auth_existe(p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from auth.users where id = p_id) $$;
grant execute on function public.test_compte_auth_existe(uuid) to authenticated;
