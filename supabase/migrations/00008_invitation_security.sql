-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00008 : sécurité de l'acceptation d'invitation
--
-- FAILLE CORRIGÉE : accept_invitation validait le jeton mais jamais le
-- destinataire. Tout compte authentifié en possession du lien pouvait
-- rejoindre le foyer (donc lire enfants, planning, dépenses, justificatifs).
--
-- Règles appliquées :
--   1. l'adresse du compte connecté doit correspondre à celle de l'invitation
--      (comparaison lower(trim(...)), insensible à la casse et aux espaces) ;
--   2. une invitation sans adresse rattachée est refusée (pas de lien « ouvert ») ;
--   3. un compte déjà membre actif d'UN AUTRE foyer est refusé — le produit
--      suppose un foyer actif par utilisateur ; le rattacher silencieusement
--      mélangerait deux familles ;
--   4. tout refus lève une exception : la transaction est annulée, donc ni le
--      statut de l'invitation ni household_members ne sont modifiés ;
--   5. le verrou FOR UPDATE est conservé (pas d'acceptation concurrente).
-- Idempotent : create or replace.
-- ============================================================

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

  -- Verrou : une seule acceptation possible, même en cas d'appels simultanés
  select * into inv from invitations where token = p_token for update;
  if not found then raise exception 'Invitation introuvable'; end if;
  if inv.status = 'revoked'  then raise exception 'Cette invitation a été révoquée'; end if;
  if inv.status = 'accepted' then raise exception 'Cette invitation a déjà été utilisée'; end if;
  if inv.expires_at < now() then
    update invitations set status = 'expired' where id = inv.id;
    raise exception 'Cette invitation a expiré';
  end if;

  -- ---- Contrôle du destinataire (source serveur : auth.users) ----
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
    -- l'adresse invitée n'est pas divulguée : on ne renseigne pas un tiers
    raise exception 'Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec le compte destinataire de l''invitation.';
  end if;

  -- ---- Un seul foyer actif par utilisateur ----
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

  insert into household_members (household_id, profile_id, role, color_key)
  values (inv.household_id, auth.uid(), inv.role, 'coral')
  on conflict (household_id, profile_id)
    do update set deleted_at = null, role = excluded.role;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (inv.household_id, auth.uid(), 'accept', 'invitation', inv.id);

  return inv.household_id;
end $$;

grant execute on function public.accept_invitation(uuid) to authenticated;

-- La fonction lit auth.users : elle est SECURITY DEFINER, donc exécutée avec
-- les droits du propriétaire. Aucun privilège supplémentaire n'est accordé au
-- rôle applicatif sur le schéma auth.
