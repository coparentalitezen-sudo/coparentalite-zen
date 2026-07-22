-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00004 : fonctions serveur
-- Création auto du profil, acceptation d'invitation, export RGPD,
-- suppression de compte et de foyer. Toutes en SECURITY DEFINER
-- avec search_path verrouillé (exécutées avec les droits postgres,
-- vérifications d'autorisation explicites à l'intérieur).
-- ============================================================

-- ---------- 1. Création automatique du profil à l'inscription ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2. Création d'un foyer (foyer + membre owner, atomique) ----------
create or replace function public.create_household(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Le nom du foyer est requis'; end if;
  insert into households (name, created_by) values (trim(p_name), auth.uid()) returning id into hid;
  insert into household_members (household_id, profile_id, role, color_key)
  values (hid, auth.uid(), 'owner', 'navy');
  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (hid, auth.uid(), 'create', 'household', hid);
  return hid;
end $$;

-- ---------- 3. Créer une invitation ----------
create or replace function public.create_invitation(p_household uuid, p_email text, p_role member_role default 'parent')
returns uuid language plpgsql security definer set search_path = public as $$
declare tok uuid;
begin
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à inviter dans ce foyer';
  end if;
  if p_role in ('owner','admin') then
    raise exception 'Ce rôle ne peut pas être attribué par invitation';
  end if;
  -- une seule invitation en attente par e-mail et par foyer
  update invitations set status = 'revoked'
  where household_id = p_household and lower(email) = lower(p_email) and status = 'pending';
  insert into invitations (household_id, email, role, created_by)
  values (p_household, lower(trim(p_email)), p_role, auth.uid())
  returning token into tok;
  insert into audit_logs (household_id, actor_id, action, entity)
  values (p_household, auth.uid(), 'invite', 'invitation');
  return tok;
end $$;

-- ---------- 4. Accepter une invitation par jeton ----------
create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into inv from invitations where token = p_token for update;
  if not found then raise exception 'Invitation introuvable'; end if;
  if inv.status = 'revoked' then raise exception 'Cette invitation a été révoquée'; end if;
  if inv.status = 'accepted' then raise exception 'Cette invitation a déjà été utilisée'; end if;
  if inv.expires_at < now() then
    update invitations set status = 'expired' where id = inv.id;
    raise exception 'Cette invitation a expiré';
  end if;
  update invitations set status = 'accepted', accepted_by = auth.uid() where id = inv.id;
  insert into household_members (household_id, profile_id, role, color_key)
  values (inv.household_id, auth.uid(), inv.role, 'coral')
  on conflict (household_id, profile_id) do update set deleted_at = null, role = excluded.role;
  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (inv.household_id, auth.uid(), 'accept', 'invitation', inv.id);
  return inv.household_id;
end $$;

-- ---------- 5. Révoquer une invitation ----------
create or replace function public.revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select household_id into hid from invitations where id = p_id;
  if hid is null or not public.can_write(hid) then
    raise exception 'Invitation introuvable ou non autorisée';
  end if;
  update invitations set status = 'revoked' where id = p_id and status = 'pending';
end $$;

-- ---------- 6. Export RGPD : toutes les données de l'utilisateur ----------
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Authentification requise'; end if;
  select jsonb_build_object(
    'genere_le', now(),
    'profil', (select to_jsonb(p) - 'id' from profiles p where p.id = uid),
    'parametres', (select to_jsonb(s) - 'profile_id' from user_settings s where s.profile_id = uid),
    'consentements', (select coalesce(jsonb_agg(to_jsonb(c) - 'profile_id' - 'ip_hash'), '[]') from consent_logs c where c.profile_id = uid),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]') from notifications n where n.profile_id = uid),
    'foyers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'foyer', to_jsonb(h),
        'mon_role', m.role,
        'enfants', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from children c where c.household_id = h.id and c.deleted_at is null),
        'regles_de_garde', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from custody_rules r where r.household_id = h.id and r.deleted_at is null),
        'depenses', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from expenses e where e.household_id = h.id and e.deleted_at is null),
        'remboursements', (select coalesce(jsonb_agg(to_jsonb(r2)), '[]') from reimbursements r2 where r2.household_id = h.id and r2.deleted_at is null),
        'evenements', (select coalesce(jsonb_agg(to_jsonb(ev)), '[]') from calendar_events ev where ev.household_id = h.id and ev.deleted_at is null),
        'demandes_de_modification', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from exchange_requests x where x.household_id = h.id),
        'documents', (select coalesce(jsonb_agg(to_jsonb(d) - 'storage_path'), '[]') from documents d where d.household_id = h.id and d.deleted_at is null)
      )), '[]')
      from households h
      join household_members m on m.household_id = h.id and m.profile_id = uid and m.deleted_at is null
      where h.deleted_at is null
    )
  ) into result;
  return result;
end $$;

-- ---------- 7. Suppression d'un foyer (propriétaire uniquement) ----------
create or replace function public.delete_household(p_household uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.member_role_in(p_household) <> 'owner' then
    raise exception 'Seul le propriétaire du foyer peut le supprimer';
  end if;
  -- suppression logique en cascade (les justificatifs Storage sont purgés
  -- par le nettoyeur — voir GUIDE-DEPLOIEMENT, section post-déploiement)
  update expenses set deleted_at = now() where household_id = p_household and deleted_at is null;
  update reimbursements set deleted_at = now() where household_id = p_household and deleted_at is null;
  update documents set deleted_at = now() where household_id = p_household and deleted_at is null;
  update children set deleted_at = now() where household_id = p_household and deleted_at is null;
  update custody_rules set deleted_at = now() where household_id = p_household and deleted_at is null;
  update calendar_events set deleted_at = now() where household_id = p_household and deleted_at is null;
  update household_members set deleted_at = now() where household_id = p_household and deleted_at is null;
  update households set deleted_at = now() where id = p_household;
  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (p_household, auth.uid(), 'delete', 'household', p_household);
end $$;

-- ---------- 8. Suppression du compte ----------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h record;
begin
  if uid is null then raise exception 'Authentification requise'; end if;
  for h in select hm.household_id,
                  (select count(*) from household_members m2
                   where m2.household_id = hm.household_id and m2.deleted_at is null) as members
           from household_members hm
           where hm.profile_id = uid and hm.deleted_at is null
  loop
    if h.members = 1 then
      perform public.delete_household(h.household_id); -- dernier membre → le foyer part avec lui
    else
      update household_members set deleted_at = now()
      where household_id = h.household_id and profile_id = uid;
    end if;
  end loop;
  update profiles set deleted_at = now(),
         email = 'supprime-' || uid || '@compte-supprime.invalid',
         display_name = 'Compte supprimé', avatar_url = null
  where id = uid;
  delete from notification_preferences where profile_id = uid;
  delete from user_settings where profile_id = uid;
  delete from auth.users where id = uid; -- révoque toutes les sessions
end $$;

-- Droits d'exécution
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_invitation(uuid, text, member_role) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_household(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
