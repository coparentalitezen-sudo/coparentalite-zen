-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00032 : code de confirmation
--
-- PROBLÈME RÉSOLU
-- Une invitation sans adresse e-mail n'a que le lien pour secret. Or la page
-- de connexion ne filtre rien : quiconque reçoit le lien peut créer un compte
-- en trente secondes et rejoindre le foyer — planning, dépenses, prénoms des
-- enfants.
--
-- SOLUTION
-- Un code à six chiffres, généré avec l'invitation et transmis PAR UN AUTRE
-- CANAL : de vive voix, ou dans un second message. Le lien seul ne suffit plus.
-- C'est le principe du double canal : intercepter l'un ne donne rien.
--
-- Le code n'est exigé que lorsque l'invitation ne porte pas d'adresse. Avec
-- une adresse, la vérification par courriel joue déjà ce rôle.
--
-- PROTECTION CONTRE L'ESSAI EXHAUSTIF
-- Un million de combinaisons se parcourt vite. Le nombre de tentatives est
-- donc compté, et l'invitation se révoque d'elle-même au cinquième échec.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Colonnes ----------
alter table invitations add column if not exists code_confirmation text;
alter table invitations add column if not exists tentatives smallint not null default 0;

-- ---------- 2. Génération ----------
/**
 * Code à six chiffres, tiré au sort.
 *
 * `gen_random_bytes` fournit un aléa cryptographique, contrairement à
 * `random()` dont la suite est prédictible à partir d'une graine connue.
 */
create or replace function public.generer_code_confirmation()
returns text
language sql volatile as $$
  select lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0')
$$;

-- ---------- 3. Création d'invitation ----------
-- Le type de retour gagne le code : PostgreSQL exige alors un remplacement
-- complet, pas un « create or replace ».
drop function if exists public.create_invitation(uuid, text, member_role, text);

create or replace function public.create_invitation(
  p_household uuid,
  p_email text default null,
  p_role member_role default 'parent',
  p_phone text default null
) returns table (jeton uuid, code text)
language plpgsql security definer set search_path = public as $$
declare tok uuid; courriel text; tel text; code_gen text;
begin
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à inviter dans ce foyer';
  end if;
  if p_role in ('owner', 'admin') then
    raise exception 'Ce rôle ne peut pas être attribué par invitation';
  end if;

  courriel := nullif(lower(trim(coalesce(p_email, ''))), '');
  tel      := nullif(trim(coalesce(p_phone, '')), '');

  if courriel is null and tel is null then
    raise exception 'Indiquez une adresse e-mail ou un numéro de téléphone';
  end if;
  if courriel is not null and position('@' in courriel) = 0 then
    raise exception 'Adresse e-mail invalide';
  end if;

  -- Le code ne sert que lorsque l'adresse ne verrouille pas déjà l'invitation
  code_gen := case when courriel is null
                   then public.generer_code_confirmation() else null end;

  update invitations set status = 'revoked'
   where household_id = p_household
     and status = 'pending'
     and (
       (courriel is not null and lower(email) = courriel)
       or (tel is not null and phone = tel)
     );

  insert into invitations (household_id, email, phone, role, created_by,
                           sans_verification, code_confirmation)
  values (p_household, courriel, tel, p_role, auth.uid(),
          courriel is null, code_gen)
  returning token into tok;

  insert into audit_logs (household_id, actor_id, action, entity, after)
  values (p_household, auth.uid(), 'invite', 'invitation',
          jsonb_build_object('par_email', courriel is not null,
                             'par_telephone', tel is not null,
                             'avec_code', code_gen is not null));

  return query select tok, code_gen;
end $$;

-- ---------- 4. Ce que le destinataire doit fournir ----------
-- Consultable sans authentification : la page d'invitation doit pouvoir
-- annoncer qu'un code sera demandé, avant même que la personne ait un compte.
-- Ne révèle rien du foyer ni du code lui-même.
create or replace function public.invitation_exige_code(p_token uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select i.code_confirmation is not null
       from invitations i
      where i.token = p_token and i.status = 'pending' and i.expires_at > now()),
    false)
$$;

-- ---------- 5. Acceptation ----------
-- La signature gagne le code ; l'ancienne doit disparaître pour éviter une
-- surcharge ambiguë.
drop function if exists public.accept_invitation(uuid);

create or replace function public.accept_invitation(
  p_token uuid, p_code text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv            invitations%rowtype;
  email_compte   text;
  email_invite   text;
  autre_foyer    uuid;
  qui            text;
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

  -- ---- Code de confirmation ----
  -- Vérifié AVANT tout le reste : un lien intercepté ne doit rien apprendre
  -- sur le foyer, pas même l'existence d'un conflit d'appartenance.
  --
  -- Un code erroné renvoie NULL au lieu de lever une exception. C'est
  -- indispensable : une exception annulerait la transaction, et avec elle
  -- l'incrémentation des tentatives — le plafond ne servirait à rien.
  -- L'appelant distingue le refus par la valeur nulle, et interroge
  -- invitation_tentatives_restantes() pour le détail.
  if inv.code_confirmation is not null then
    if coalesce(trim(p_code), '') = '' then
      raise exception 'Cette invitation demande un code de confirmation. Demandez-le à la personne qui vous a invité.';
    end if;
    if trim(p_code) <> inv.code_confirmation then
      update invitations
         set tentatives = tentatives + 1,
             status = case when tentatives + 1 >= 5 then 'revoked'::invitation_status
                           else status end
       where id = inv.id;
      return null;
    end if;
  end if;

  email_invite := nullif(lower(trim(coalesce(inv.email, ''))), '');

  if email_invite is not null then
    select lower(trim(u.email)) into email_compte
      from auth.users u where u.id = auth.uid();
    if email_compte is null or email_compte = '' then
      raise exception 'Votre compte ne possède pas d''adresse e-mail vérifiable';
    end if;
    if email_compte <> email_invite then
      raise exception 'Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec le compte destinataire de l''invitation.';
    end if;
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

  -- ---- Acceptation ----
  update invitations
     set status = 'accepted', accepted_by = auth.uid()
   where id = inv.id;

  if not public.fusionner_parent_provisoire(inv.household_id, auth.uid()) then
    insert into household_members (household_id, profile_id, role, color_key)
    values (inv.household_id, auth.uid(), inv.role, 'coral')
    on conflict (household_id, profile_id)
      do update set deleted_at = null, role = excluded.role;
  end if;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
  values (inv.household_id, auth.uid(), 'accept', 'invitation', inv.id,
          jsonb_build_object('avec_code', inv.code_confirmation is not null));

  select display_name into qui from profiles where id = auth.uid();
  if inv.created_by is not null then
    perform public.notifier(
      inv.household_id, 'invitation_accepted',
      'Le second parent a rejoint le foyer',
      format('%s partage désormais votre planning et vos dépenses.',
             coalesce(qui, 'L''autre parent')),
      '/app/foyer', 'invitation', inv.id, auth.uid(), null, inv.created_by);
  end if;

  return inv.household_id;
end $$;

-- ---------- 5 bis. Tentatives restantes ----------
/**
 * Nombre d'essais encore possibles, pour que l'écran puisse le dire.
 *
 * Ne révèle ni le code ni le foyer : seulement combien de fois on peut encore
 * se tromper avant révocation.
 */
create or replace function public.invitation_tentatives_restantes(p_token uuid)
returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, 5 - coalesce(i.tentatives, 0))::int
  from invitations i
  where i.token = p_token
$$;

revoke all on function public.invitation_tentatives_restantes(uuid) from public;
grant execute on function public.invitation_tentatives_restantes(uuid) to anon, authenticated;

-- ---------- 6. Droits ----------
revoke all on function public.generer_code_confirmation() from public, anon, authenticated;
revoke all on function public.create_invitation(uuid, text, member_role, text) from public, anon;
revoke all on function public.invitation_exige_code(uuid) from public;

grant execute on function public.create_invitation(uuid, text, member_role, text) to authenticated;
grant execute on function public.accept_invitation(uuid, text) to authenticated;
-- La page d'invitation s'affiche avant toute authentification
grant execute on function public.invitation_exige_code(uuid) to anon, authenticated;

commit;
