-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00023 : second parent provisoire
--
-- PROBLÈME RÉSOLU
-- Le parcours voulu est : créer le foyer, ajouter les enfants, définir le
-- rythme, répartir les vacances, puis inviter le second parent — cette
-- invitation valant validation finale de la configuration.
--
-- Or le rythme de garde exige deux parents. Il fallait donc inviter avant de
-- configurer, ce qui obligeait à déranger l'autre parent pour un foyer encore
-- vide — et à lui montrer un espace inachevé.
--
-- SOLUTION
-- Le premier parent NOMME le second dès le départ. Un profil provisoire est
-- créé, sans compte ni possibilité de connexion : il sert uniquement de
-- repère dans le planning et les dépenses. Lorsque l'invitation est acceptée,
-- le compte réel prend sa place et hérite de tout ce qui lui était rattaché.
--
-- AUCUNE DONNÉE N'EST PERDUE À LA FUSION : périodes de garde, dépenses,
-- parts, remboursements et règles sont transférés dans la même transaction.
-- ============================================================

begin;

-- ---------- 1. Marquer un profil comme provisoire ----------
alter table profiles add column if not exists is_placeholder boolean not null default false;
alter table profiles add column if not exists placeholder_household uuid references households(id);

create index if not exists idx_profiles_placeholder
  on profiles (placeholder_household) where is_placeholder;

-- ---------- 2. Nommer le second parent ----------
create or replace function public.nommer_second_parent(
  p_household uuid, p_prenom text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; existant uuid; n_membres int;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  perform public.lock_household(p_household);

  if coalesce(trim(p_prenom), '') = '' then
    raise exception 'Indiquez le prénom du second parent';
  end if;
  if length(trim(p_prenom)) > 40 then
    raise exception 'Le prénom ne peut pas dépasser 40 caractères';
  end if;

  -- Un profil provisoire existe déjà : on le renomme plutôt que d'en créer
  select p.id into existant
    from profiles p
    join household_members hm on hm.profile_id = p.id and hm.household_id = p_household
   where p.is_placeholder and p.placeholder_household = p_household
     and hm.deleted_at is null
   limit 1;

  if existant is not null then
    update profiles set display_name = trim(p_prenom), updated_at = now()
     where id = existant;
    return existant;
  end if;

  select count(*) into n_membres from public.comptable_members(p_household);
  if n_membres >= 2 then
    raise exception 'Ce foyer compte déjà deux parents';
  end if;

  pid := gen_random_uuid();
  -- Adresse technique : ce profil ne peut ni se connecter, ni recevoir de
  -- courriel. Elle n'existe que pour satisfaire l'unicité.
  insert into profiles (id, email, display_name, is_placeholder, placeholder_household)
  values (pid, 'provisoire+' || pid::text || '@coparentalite-zen.invalid',
          trim(p_prenom), true, p_household);

  insert into household_members (household_id, profile_id, role, color_key)
  values (p_household, pid, 'parent', 'coral');

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
  values (p_household, auth.uid(), 'create', 'placeholder_parent', pid,
          jsonb_build_object('prenom', trim(p_prenom)));
  return pid;
end $$;

-- ---------- 3. Fusion à l'acceptation de l'invitation ----------
-- Le compte réel prend la place du profil provisoire et hérite de tout.
create or replace function public.fusionner_parent_provisoire(
  p_household uuid, p_reel uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
declare provisoire uuid; couleur text;
begin
  select p.id, hm.color_key into provisoire, couleur
    from profiles p
    join household_members hm on hm.profile_id = p.id and hm.household_id = p_household
   where p.is_placeholder and p.placeholder_household = p_household
     and hm.deleted_at is null
   limit 1;

  if provisoire is null then return false; end if;
  if provisoire = p_reel then return false; end if;

  -- Transfert de tout ce qui désigne le parent provisoire.
  -- L'ordre importe peu : la transaction garantit l'ensemble.
  update custody_rules set starting_parent = p_reel
   where household_id = p_household and starting_parent = provisoire;

  update custody_rules
     set config = jsonb_set(config, '{parent2}', to_jsonb(p_reel::text))
   where household_id = p_household and config->>'parent2' = provisoire::text;

  update custody_exceptions set parent_id = p_reel
   where household_id = p_household and parent_id = provisoire;

  update expenses set paid_by = p_reel
   where household_id = p_household and paid_by = provisoire;
  update expenses set created_by = p_reel
   where household_id = p_household and created_by = provisoire;

  update expense_shares set parent_id = p_reel
   where parent_id = provisoire
     and expense_id in (select id from expenses where household_id = p_household);

  update reimbursements set from_parent = p_reel
   where household_id = p_household and from_parent = provisoire;
  update reimbursements set to_parent = p_reel
   where household_id = p_household and to_parent = provisoire;

  update children set created_by = p_reel
   where household_id = p_household and created_by = provisoire;

  -- Le compte réel rejoint le foyer en reprenant la couleur du provisoire,
  -- pour que le planning ne change pas d'apparence sous les yeux des parents.
  insert into household_members (household_id, profile_id, role, color_key)
  values (p_household, p_reel, 'parent', couleur)
  on conflict (household_id, profile_id) do update
    set deleted_at = null, color_key = excluded.color_key, updated_at = now();

  -- Le provisoire disparaît du foyer
  update household_members set deleted_at = now()
   where household_id = p_household and profile_id = provisoire;
  update profiles set deleted_at = now() where id = provisoire;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before, after)
  values (p_household, p_reel, 'merge', 'placeholder_parent', provisoire,
          jsonb_build_object('provisoire', provisoire),
          jsonb_build_object('reel', p_reel));
  return true;
end $$;

-- ---------- 4. L'acceptation d'invitation déclenche la fusion ----------
-- La fonction de la migration 00008 est reprise intégralement : tous ses
-- contrôles de sécurité restent en place. Seule l'entrée dans le foyer change,
-- pour reprendre la place du parent provisoire s'il existe.
create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv            invitations%rowtype;
  email_compte   text;
  email_invite   text;
  autre_foyer    uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select * into inv from invitations where token = p_token for update;
  if not found then raise exception 'Invitation introuvable'; end if;
  if inv.status = 'revoked'  then raise exception 'Cette invitation a été révoquée'; end if;
  if inv.status = 'accepted' then raise exception 'Cette invitation a déjà été utilisée'; end if;
  if inv.expires_at < now() then
    update invitations set status = 'expired' where id = inv.id;
    raise exception 'Cette invitation a expiré';
  end if;

  select lower(trim(u.email)) into email_compte
  from auth.users u where u.id = auth.uid();
  email_invite := lower(trim(inv.email));

  if email_invite is null or email_invite = '' then
    raise exception 'Cette invitation n''est rattachée à aucune adresse e-mail : demandez-en une nouvelle';
  end if;
  if email_compte is null or email_compte = '' then
    raise exception 'Votre compte ne possède pas d''adresse e-mail vérifiable';
  end if;
  if email_compte <> email_invite then
    raise exception 'Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec le compte destinataire de l''invitation.';
  end if;

  select hm.household_id into autre_foyer
  from household_members hm
  where hm.profile_id = auth.uid()
    and hm.deleted_at is null
    and hm.household_id <> inv.household_id
  limit 1;
  if autre_foyer is not null then
    raise exception 'Vous appartenez déjà à un autre foyer. Quittez-le ou supprimez-le avant de rejoindre celui-ci.';
  end if;

  if exists (select 1 from household_members hm
             where hm.household_id = inv.household_id
               and hm.profile_id = auth.uid()
               and hm.deleted_at is null) then
    raise exception 'Vous êtes déjà membre de ce foyer';
  end if;

  -- ---- Acceptation (à partir d'ici, plus aucun refus possible) ----
  update invitations
     set status = 'accepted', accepted_by = auth.uid()
   where id = inv.id;

  -- Si le premier parent avait nommé le second, le compte réel prend sa place
  -- et hérite de tout ce qui lui était rattaché : planning, dépenses, parts,
  -- remboursements. Sinon, entrée classique dans le foyer.
  if not public.fusionner_parent_provisoire(inv.household_id, auth.uid()) then
    insert into household_members (household_id, profile_id, role, color_key)
    values (inv.household_id, auth.uid(), inv.role, 'coral')
    on conflict (household_id, profile_id)
      do update set deleted_at = null, role = excluded.role;
  end if;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (inv.household_id, auth.uid(), 'accept', 'invitation', inv.id);

  return inv.household_id;
end $$;

grant execute on function public.accept_invitation(uuid) to authenticated;

-- ---------- 5. Droits ----------
revoke all on function public.nommer_second_parent(uuid, text) from public, anon;
revoke all on function public.fusionner_parent_provisoire(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nommer_second_parent(uuid, text) to authenticated;

commit;
