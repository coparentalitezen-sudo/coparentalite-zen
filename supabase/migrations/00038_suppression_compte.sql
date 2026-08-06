-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00038 : suppression de compte complétée
--
-- CE QUI EXISTAIT
-- delete_my_account() est en place depuis la migration 00004. Elle quitte les
-- foyers, ferme ceux dont on était le dernier membre, anonymise le profil et
-- révoque les sessions. L'essentiel était donc déjà là — mais rien ne
-- l'appelait : aucun écran ne l'exposait, et le droit restait théorique.
--
-- CE QUI MANQUAIT
--   * les appareils inscrits aux notifications demeuraient, avec leurs clés ;
--   * les notifications déjà reçues aussi, titres et corps compris, alors
--     qu'elles nomment les enfants et les mouvements de garde ;
--   * les invitations en attente restaient ouvertes, permettant à un tiers de
--     rejoindre un foyer au nom d'un parent qui n'existe plus ;
--   * l'effacement ne laissait aucune trace, alors qu'il faut pouvoir prouver
--     qu'il a eu lieu, et quand ;
--
-- CE QUI RESTE EN L'ÉTAT
-- Un foyer où ne subsiste qu'un parent provisoire — fiche sans compte, créée
-- en attendant l'invitation — continue d'exister. L'écarter demanderait de
-- consulter les profils, or les règles de sécurité s'appliquent à l'intérieur
-- de cette fonction et y rendent le coparent invisible : le foyer serait
-- fermé à tort. Mieux vaut un foyer vide qu'un planning effacé.
--
-- CE QUI NE DOIT PAS PARTIR
-- Le planning, les dépenses et les enfants d'un foyer partagé. Ils
-- appartiennent aussi à l'autre parent, qui y organise ses propres enfants et
-- peut avoir à produire ces justificatifs. Le profil subsiste donc, anonyme,
-- parce que les écritures le désignent comme auteur.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- La fonction rendait void ; elle rend désormais le compte de ce qui a été
-- fait, pour que l'écran puisse le dire au parent. Changer un type de retour
-- impose de retirer l'ancienne version.
drop function if exists public.delete_my_account();

create or replace function public.delete_my_account()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  h record;
  quittes int := 0;
  fermes int := 0;
begin
  if uid is null then raise exception 'Authentification requise'; end if;

  for h in
    select hm.household_id,
           -- Le décompte s'en tient aux membres, sans consulter les profils.
           --
           -- Une jointure sur profiles paraissait plus fine — elle aurait
           -- écarté les parents provisoires, ces fiches sans compte créées en
           -- attendant l'invitation. Mais les règles de sécurité s'appliquent
           -- à l'intérieur de cette fonction : le profil du coparent y devient
           -- invisible, le décompte tombe à zéro, et un foyer bien vivant se
           -- referme sous les yeux de l'autre parent. Le risque est trop grave
           -- pour un gain de finesse : un foyer où ne subsiste qu'un parent
           -- provisoire survivra donc, et c'est le bon sens du doute.
           (select count(*) from household_members m2
            where m2.household_id = hm.household_id
              and m2.deleted_at is null
              and m2.profile_id <> uid) as autres
      from household_members hm
     where hm.profile_id = uid and hm.deleted_at is null
  loop
    quittes := quittes + 1;
    if h.autres = 0 then
      perform public.delete_household(h.household_id);
      fermes := fermes + 1;
    else
      update household_members set deleted_at = now()
       where household_id = h.household_id and profile_id = uid;
    end if;
  end loop;

  -- Les invitations émises et non abouties n'ont plus d'objet : les laisser
  -- ouvertes permettrait d'entrer dans un foyer au nom d'un parent disparu.
  update invitations set status = 'revoked'
   where created_by = uid and status = 'pending';

  -- Anonymisation. Le profil demeure parce que dépenses, périodes et journal
  -- le désignent comme auteur ; il ne porte plus rien de nominatif, et
  -- l'adresse est libérée pour un éventuel retour.
  update profiles
     set deleted_at   = now(),
         email        = 'supprime-' || uid || '@compte-supprime.invalid',
         display_name = 'Compte supprimé',
         avatar_url   = null
   where id = uid;

  -- Ce qui n'appartient qu'à moi disparaît réellement.
  delete from notification_preferences where profile_id = uid;
  delete from user_settings            where profile_id = uid;
  delete from push_subscriptions       where profile_id = uid;
  delete from notifications            where profile_id = uid;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
  values (null, uid, 'delete', 'account', uid,
          jsonb_build_object('foyers_quittes', quittes, 'foyers_fermes', fermes,
                             'le', now()));

  -- Révoquer les sessions. Sur une base d'essai, auth.users n'est qu'un
  -- mannequin dont le rôle applicatif n'a pas la clé : l'échec ne doit pas
  -- annuler un effacement par ailleurs accompli.
  begin
    delete from auth.users where id = uid;
  exception when insufficient_privilege or undefined_table then
    null;
  end;

  return jsonb_build_object('foyers_quittes', quittes, 'foyers_fermes', fermes);
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;

notify pgrst, 'reload schema';
