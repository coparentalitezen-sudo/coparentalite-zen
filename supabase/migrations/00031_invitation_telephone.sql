-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00031 : invitation sans adresse e-mail
--
-- BESOIN
-- Un parent ne connaît pas toujours l'adresse e-mail de l'autre, ou celui-ci
-- n'en utilise pas. Exiger l'adresse bloquait alors l'invitation, alors que le
-- numéro de téléphone suffisait à transmettre le lien.
--
-- COMPROMIS ASSUMÉ
-- L'adresse e-mail verrouille l'invitation à une personne précise : le lien
-- transféré ou intercepté ne sert à rien sans elle. Sans adresse, le LIEN
-- DEVIENT LE SECRET — quiconque le reçoit entre dans le foyer.
--
-- Trois garde-fous compensent, sans annuler le risque :
--   * expiration à sept jours, comme avant ;
--   * usage unique, le jeton est consommé à la première acceptation ;
--   * notification immédiate au parent invitant, pour qu'il puisse réagir
--     si ce n'est pas la bonne personne qui a rejoint.
--
-- L'invitation par adresse reste la voie recommandée et le défaut.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. L'adresse devient facultative ----------
alter table invitations alter column email drop not null;

-- Trace du canal employé : utile pour expliquer, plus tard, comment une
-- personne est entrée dans le foyer.
alter table invitations add column if not exists phone text;
alter table invitations add column if not exists sans_verification boolean not null default false;

-- ---------- 2. Création ----------
-- La signature gagne le numéro de téléphone. L'ancienne doit disparaître :
-- deux surcharges rendraient l'appel ambigu.
drop function if exists public.create_invitation(uuid, text, member_role);

create or replace function public.create_invitation(
  p_household uuid,
  p_email text default null,
  p_role member_role default 'parent',
  p_phone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare tok uuid; courriel text; tel text;
begin
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à inviter dans ce foyer';
  end if;
  if p_role in ('owner', 'admin') then
    raise exception 'Ce rôle ne peut pas être attribué par invitation';
  end if;

  courriel := nullif(lower(trim(coalesce(p_email, ''))), '');
  tel      := nullif(trim(coalesce(p_phone, '')), '');

  -- L'un des deux au moins : sans coordonnée, le lien ne peut pas être remis.
  if courriel is null and tel is null then
    raise exception 'Indiquez une adresse e-mail ou un numéro de téléphone';
  end if;
  if courriel is not null and position('@' in courriel) = 0 then
    raise exception 'Adresse e-mail invalide';
  end if;

  -- Une seule invitation en attente par destinataire et par foyer
  update invitations set status = 'revoked'
   where household_id = p_household
     and status = 'pending'
     and (
       (courriel is not null and lower(email) = courriel)
       or (tel is not null and phone = tel)
     );

  insert into invitations (household_id, email, phone, role, created_by,
                           sans_verification)
  values (p_household, courriel, tel, p_role, auth.uid(),
          courriel is null)
  returning token into tok;

  insert into audit_logs (household_id, actor_id, action, entity, after)
  values (p_household, auth.uid(), 'invite', 'invitation',
          jsonb_build_object('par_email', courriel is not null,
                             'par_telephone', tel is not null));
  return tok;
end $$;

-- ---------- 3. Acceptation ----------
-- La vérification de l'adresse ne s'applique que si l'invitation en porte une.
-- Sans adresse, le jeton fait seul autorité — c'est le compromis assumé.
create or replace function public.accept_invitation(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv            invitations%rowtype;
  email_compte   text;
  email_invite   text;
  autre_foyer    uuid;
  invitant       uuid;
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

  email_invite := nullif(lower(trim(coalesce(inv.email, ''))), '');

  -- Invitation nominative : l'adresse du compte doit correspondre
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
          jsonb_build_object('sans_verification', coalesce(inv.sans_verification, false)));

  -- Le parent invitant est prévenu sur-le-champ : c'est ce qui lui permet de
  -- réagir si ce n'est pas la personne attendue qui a rejoint.
  select display_name into qui from profiles where id = auth.uid();
  invitant := inv.created_by;
  if invitant is not null then
    perform public.notifier(
      inv.household_id, 'invitation_accepted',
      'Le second parent a rejoint le foyer',
      case when coalesce(inv.sans_verification, false)
        then format('%s a rejoint votre foyer via le lien. Si ce n''est pas la personne attendue, retirez-la depuis les paramètres.',
                    coalesce(qui, 'Quelqu''un'))
        else format('%s partage désormais votre planning et vos dépenses.',
                    coalesce(qui, 'L''autre parent'))
      end,
      '/app/foyer', 'invitation', inv.id, auth.uid(), null, invitant);
  end if;

  return inv.household_id;
end $$;

-- ---------- 4. Droits ----------
revoke all on function public.create_invitation(uuid, text, member_role, text) from public, anon;
grant execute on function public.create_invitation(uuid, text, member_role, text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;

commit;
