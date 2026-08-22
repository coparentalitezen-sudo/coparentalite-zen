-- ============================================================
-- 00047 — Décompte des non-lues dans la file d'envoi Push
-- ============================================================
--
-- POURQUOI
-- La pastille de l'icône d'accueil doit porter le nombre exact de
-- notifications non lues, y compris lorsque l'application est fermée. Le
-- service worker, seul actif dans ce cas, n'a aucun accès à la base : le
-- chiffre doit donc voyager dans le message poussé lui-même.
--
-- Sans lui, le service worker ne pouvait qu'incrémenter d'une unité à chaque
-- notification reçue, un compte qui dérive dès qu'une notification est lue
-- ailleurs, ou qu'un message n'arrive pas.
--
-- CE QUI CHANGE
-- notifications_a_pousser renvoie une colonne supplémentaire, non_lues :
-- le nombre de notifications non lues du destinataire dans le foyer concerné,
-- au moment de l'envoi. Le calcul reproduit exactement celui de
-- compter_notifications_non_lues — deux chiffres différents pour la même
-- chose donneraient l'impression que l'un des deux ment.
--
-- La notification en cours d'envoi est comptée : elle n'est pas encore lue,
-- et la pastille doit l'inclure.
--
-- PRÉCAUTION
-- Ajouter une colonne à un `returns table` change la signature de retour :
-- PostgreSQL refuse alors un simple `create or replace`. Il faut supprimer
-- puis recréer — et la suppression emporte les droits accordés. Le grant à
-- service_role est donc reposé explicitement en fin de migration. L'oublier
-- produirait un échec silencieux de tout l'acheminement Push.
-- ============================================================

drop function if exists public.notifications_a_pousser(int);

create function public.notifications_a_pousser(p_limite int default 100)
returns table (
  notification_id uuid,
  profile_id uuid,
  titre text,
  corps text,
  href text,
  endpoint text,
  p256dh text,
  auth text,
  non_lues int
)
language sql stable security definer set search_path = public as $$
  select n.id, n.profile_id, n.title, n.body, n.link_path,
         s.endpoint, s.p256dh, s.auth,
         (select count(*)::int
            from notifications n2
           where n2.profile_id = n.profile_id
             and n2.household_id = n.household_id
             and n2.read_at is null
             and n2.scheduled_at <= now()) as non_lues
  from notifications n
  join notification_types t on t.code = n.kind
  join push_subscriptions s
    on s.profile_id = n.profile_id and s.deleted_at is null
  where n.scheduled_at <= now()
    and n.read_at is null
    -- Une alerte vieille de plus d'un jour n'a plus d'objet
    and n.scheduled_at > now() - interval '24 hours'
    and not exists (
      select 1 from notification_deliveries d
       where d.notification_id = n.id and d.channel_code = 'push'
    )
    and coalesce(
      (select np.enabled from notification_preferences np
        where np.profile_id = n.profile_id
          and np.household_id = n.household_id
          and np.kind = n.kind
          and np.channel = 'push'::notif_channel),
      t.defaut_actif)
  order by n.scheduled_at
  limit greatest(1, least(coalesce(p_limite, 100), 500))
$$;

-- ---------- Droits ----------
-- La fonction n'est appelée que par la route d'acheminement, qui s'authentifie
-- avec la clé de service. Aucun rôle client n'y accède.
revoke all on function public.notifications_a_pousser(int) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.notifications_a_pousser(int) to service_role';
  end if;
end $$;
