-- COPARENTALITÉ ZEN — Migration 00026 : durcissement des RPC
begin;

alter function public.set_updated_at() set search_path = public;
alter function public.household_from_path(text) set search_path = public;

-- Fonction de trigger uniquement : aucun appel RPC direct.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Helpers et opérations sensibles : jamais anonymes.
revoke all on function public.can_write(uuid) from public, anon;
revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.is_parent(uuid) from public, anon;
revoke all on function public.member_role_in(uuid) from public, anon;
revoke all on function public.create_household(text) from public, anon;
revoke all on function public.create_invitation(uuid, text, public.member_role) from public, anon;
revoke all on function public.accept_invitation(uuid) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.delete_household(uuid) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.export_my_data() from public, anon;

grant execute on function public.can_write(uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_parent(uuid) to authenticated;
grant execute on function public.member_role_in(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.member_role) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.delete_household(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.export_my_data() to authenticated;

-- Lectures réellement publiques, accordées explicitement.
revoke all on function public.grille_tarifaire() from public;
revoke all on function public.grille_extensions() from public;
revoke all on function public.pays_disponibles() from public;
revoke all on function public.zones_disponibles(text) from public;
grant execute on function public.grille_tarifaire() to anon, authenticated;
grant execute on function public.grille_extensions() to anon, authenticated;
grant execute on function public.pays_disponibles() to anon, authenticated;
grant execute on function public.zones_disponibles(text) to anon, authenticated;

-- Cette table est interne aux futurs canaux Push/e-mail. L'absence de policy
-- est volontaire : même un utilisateur authentifié ne la lit pas directement.
revoke all on table public.notification_deliveries from public, anon, authenticated;
comment on table public.notification_deliveries is
  'Traces internes de livraison, accessibles uniquement au rôle de service.';

commit;
