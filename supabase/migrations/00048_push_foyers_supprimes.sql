-- ============================================================
-- 00048 — Écarter les foyers supprimés de la file d'envoi Push
-- ============================================================
--
-- POURQUOI
-- `households` pratique la suppression douce : la ligne demeure, marquée par
-- deleted_at. Les notifications rattachées à un foyer supprimé subsistent donc
-- elles aussi, et la file d'envoi les poussait encore.
--
-- Constaté en production : un profil portait sept notifications non lues dans
-- un foyer supprimé. Poussées, elles auraient posé une pastille de sept sur
-- l'icône, renvoyant vers un foyer que le parent ne peut plus ouvrir — un
-- chiffre qu'aucun geste dans l'application n'aurait pu faire disparaître.
--
-- CE QUI CHANGE
-- Deux filtres, sur la notification elle-même et sur le décompte qui
-- l'accompagne. Le second compte autant que le premier : sans lui, une
-- notification légitime d'un foyer actif afficherait un total gonflé par les
-- non-lues d'un foyer disparu.
--
-- La cloche, elle, n'a jamais eu ce défaut : elle interroge un foyer précis,
-- celui que le parent a ouvert. C'est la file d'envoi qui balayait tout.
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
            join households h2 on h2.id = n2.household_id
           where n2.profile_id = n.profile_id
             and n2.household_id = n.household_id
             and h2.deleted_at is null
             and n2.read_at is null
             and n2.scheduled_at <= now()) as non_lues
  from notifications n
  join notification_types t on t.code = n.kind
  join households h on h.id = n.household_id and h.deleted_at is null
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
-- La suppression emporte les droits : les reposer n'est pas optionnel, faute
-- de quoi l'acheminement échoue sans le moindre message.
revoke all on function public.notifications_a_pousser(int) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.notifications_a_pousser(int) to service_role';
  end if;
end $$;
